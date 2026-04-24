/**
 * Static effect analyzer for TypeScript source code.
 *
 * Two-pass analysis:
 * 1. Walk the AST. Detect direct effects from known functions and modules.
 *    Record every call site for the call graph.
 * 2. Propagate effects through intra-module calls. If function A calls
 *    function B (via this.method(), ClassName.method(), or bare name()),
 *    A inherits B's effects. Iterate until stable.
 *
 * Same vocabulary as libgaze (Python). Same architecture. Different AST.
 */

import { Project, SyntaxKind, Node } from "ts-morph";
import type { SourceFile, CallExpression, PropertyAccessExpression } from "ts-morph";
import type { Effect } from "./effects.js";
import { MODULE_EFFECTS, FUNCTION_EFFECTS } from "./effects.js";

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

export interface FunctionEffects {
  name: string;
  line: number;
  effects: Set<Effect>;
  calls: string[];
  evidence: string[];
  pure: boolean;
}

export interface ModuleEffects {
  path: string;
  functions: FunctionEffects[];
  moduleEffects: Set<Effect>;
  allEffects: Set<Effect>;
}

interface ModuleStructure {
  classMethods: Map<string, Set<string>>;  // className -> methodNames
  functionOwner: Map<string, string>;       // fnName -> className
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function analyzeSource(source: string, path = "<string>"): ModuleEffects {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(path, source);
  return analyzeFile(file, path);
}

export function analyzeFilePath(filePath: string): ModuleEffects {
  const project = new Project();
  const file = project.addSourceFileAtPath(filePath);
  return analyzeFile(file, filePath);
}

function analyzeFile(file: SourceFile, path: string): ModuleEffects {
  const imports = new Map<string, string>();  // localName -> moduleName
  const moduleEffects = new Set<Effect>();
  const functions: FunctionEffects[] = [];
  const structure: ModuleStructure = {
    classMethods: new Map(),
    functionOwner: new Map(),
  };

  // --- Pass 1: collect imports ---
  for (const imp of file.getImportDeclarations()) {
    const moduleSpec = imp.getModuleSpecifierValue();
    const effect = resolveModuleEffect(moduleSpec);
    if (effect) {
      moduleEffects.add(effect);
    }

    // Track named imports
    for (const named of imp.getNamedImports()) {
      const localName = named.getAliasNode()?.getText() ?? named.getName();
      imports.set(localName, moduleSpec);
    }

    // Track default import
    const defaultImport = imp.getDefaultImport();
    if (defaultImport) {
      imports.set(defaultImport.getText(), moduleSpec);
    }

    // Track namespace import
    const nsImport = imp.getNamespaceImport();
    if (nsImport) {
      imports.set(nsImport.getText(), moduleSpec);
    }
  }

  // Also track require() calls
  file.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
    if (call.getExpression().getText() === "require") {
      const args = call.getArguments();
      if (args.length === 1 && Node.isStringLiteral(args[0])) {
        const moduleSpec = args[0].getLiteralText();
        const effect = resolveModuleEffect(moduleSpec);
        if (effect) {
          moduleEffects.add(effect);
        }
        // Track the variable it's assigned to
        const parent = call.getParent();
        if (parent && Node.isVariableDeclaration(parent)) {
          imports.set(parent.getName(), moduleSpec);
        }
      }
    }
  });

  // --- Pass 1: collect class structure ---
  for (const cls of file.getClasses()) {
    const className = cls.getName() ?? "";
    if (!className) continue;
    const methods = new Set<string>();
    for (const method of cls.getMethods()) {
      const name = method.getName();
      methods.add(name);
      structure.functionOwner.set(name, className);
    }
    structure.classMethods.set(className, methods);
  }

  // --- Pass 1: analyze functions ---
  const analyzeFn = (name: string, node: Node, line: number) => {
    const fn: FunctionEffects = {
      name,
      line,
      effects: new Set(),
      calls: [],
      evidence: [],
      pure: true,
    };

    // Walk all call expressions in this function
    node.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
      const callName = resolveCallName(call, imports);
      if (callName) {
        fn.calls.push(callName);
        checkCallEffects(callName, call.getStartLineNumber(), fn, imports);
      }
    });

    // Walk require() calls inside functions (dynamic imports)
    node.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
      if (call.getExpression().getText() === "require") {
        const callArgs = call.getArguments();
        if (callArgs.length === 1 && Node.isStringLiteral(callArgs[0])) {
          const moduleSpec = callArgs[0].getLiteralText();
          const effect = resolveModuleEffect(moduleSpec);
          if (effect) {
            record(fn, effect, `require("${moduleSpec}")`, call.getStartLineNumber());
          }
        }
      }
    });

    // Walk new expressions (new Function(...), new Worker(...))
    node.getDescendantsOfKind(SyntaxKind.NewExpression).forEach(expr => {
      const ctorExpr = expr.getExpression();
      if (Node.isIdentifier(ctorExpr)) {
        const name = ctorExpr.getText();
        const key = `new ${name}`;
        if (FUNCTION_EFFECTS.has(key)) {
          record(fn, FUNCTION_EFFECTS.get(key)!, `${key}()`, expr.getStartLineNumber());
        } else if (FUNCTION_EFFECTS.has(name)) {
          record(fn, FUNCTION_EFFECTS.get(name)!, `new ${name}()`, expr.getStartLineNumber());
        }
      }
    });

    // Check property access (process.env, etc.)
    node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).forEach(prop => {
      const chain = resolvePropertyChain(prop);
      if (chain) {
        const effect = FUNCTION_EFFECTS.get(chain);
        if (effect) {
          record(fn, effect, chain, prop.getStartLineNumber());
        }
      }
    });

    fn.pure = fn.effects.size === 0;
    functions.push(fn);
  };

  // Top-level function declarations
  for (const decl of file.getFunctions()) {
    const name = decl.getName() ?? "<anonymous>";
    analyzeFn(name, decl, decl.getStartLineNumber());
  }

  // Class methods
  for (const cls of file.getClasses()) {
    for (const method of cls.getMethods()) {
      analyzeFn(method.getName(), method, method.getStartLineNumber());
    }
  }

  // Exported arrow functions / function expressions assigned to variables
  for (const varDecl of file.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      analyzeFn(varDecl.getName(), init, varDecl.getStartLineNumber());
    }
  }

  // --- Pass 2: propagate effects ---
  propagateEffects(functions, structure);

  // Compute allEffects
  const allEffects = new Set(moduleEffects);
  for (const fn of functions) {
    for (const e of fn.effects) {
      allEffects.add(e);
    }
  }

  return { path, functions, moduleEffects, allEffects };
}

// ---------------------------------------------------------------------------
// Call resolution
// ---------------------------------------------------------------------------

function resolveCallName(call: CallExpression, imports: Map<string, string>): string | null {
  const expr = call.getExpression();

  // Simple name: fetch(), eval(), myFunction()
  if (Node.isIdentifier(expr)) {
    const name = expr.getText();
    // Resolve through imports
    if (imports.has(name)) {
      return `${imports.get(name)}.${name}`;
    }
    return name;
  }

  // Property access: fs.readFile(), this.method(), console.log()
  if (Node.isPropertyAccessExpression(expr)) {
    const chain = resolvePropertyChain(expr);
    if (chain) {
      // Resolve first part through imports
      const parts = chain.split(".");
      if (parts.length >= 2 && imports.has(parts[0])) {
        return `${imports.get(parts[0])}.${parts.slice(1).join(".")}`;
      }
      return chain;
    }
  }

  return null;
}

function resolvePropertyChain(node: PropertyAccessExpression): string | null {
  const parts: string[] = [];
  let current: Node = node;

  while (Node.isPropertyAccessExpression(current)) {
    parts.unshift(current.getName());
    current = (current as PropertyAccessExpression).getExpression();
  }

  if (Node.isIdentifier(current)) {
    parts.unshift(current.getText());
    return parts.join(".");
  }

  if (Node.isThisExpression(current)) {
    parts.unshift("this");
    return parts.join(".");
  }

  return null;
}

// ---------------------------------------------------------------------------
// Effect detection
// ---------------------------------------------------------------------------

function resolveModuleEffect(moduleSpec: string): Effect | undefined {
  // Exact match
  if (MODULE_EFFECTS.has(moduleSpec)) {
    return MODULE_EFFECTS.get(moduleSpec);
  }
  // Prefix match: "@aws-sdk" matches "@aws-sdk/client-s3"
  for (const [pattern, effect] of MODULE_EFFECTS) {
    if (moduleSpec === pattern || moduleSpec.startsWith(pattern + "/")) {
      return effect;
    }
  }
  return undefined;
}

function checkCallEffects(
  callName: string,
  line: number,
  fn: FunctionEffects,
  imports: Map<string, string>,
): void {
  // Direct function match (globals like fetch, eval, console.log)
  if (FUNCTION_EFFECTS.has(callName)) {
    record(fn, FUNCTION_EFFECTS.get(callName)!, `${callName}()`, line);
    return;
  }

  // If the call name was resolved through imports (e.g. "node:fs.readFileSync"),
  // extract the module part and check it against MODULE_EFFECTS.
  const dotIdx = callName.indexOf(".");
  if (dotIdx > 0) {
    const modulePart = callName.slice(0, dotIdx);
    const effect = resolveModuleEffect(modulePart);
    if (effect) {
      record(fn, effect, `${callName}()`, line);
      return;
    }
  }

  // Check if the first part is a local name imported from a known module
  const parts = callName.split(".");
  if (parts.length >= 2) {
    const firstPart = parts[0];
    if (imports.has(firstPart)) {
      const moduleSpec = imports.get(firstPart)!;
      const effect = resolveModuleEffect(moduleSpec);
      if (effect) {
        record(fn, effect, `${callName}()`, line);
        return;
      }
    }

    // Check the dotted prefix against known functions
    for (let i = parts.length; i >= 2; i--) {
      const prefix = parts.slice(0, i).join(".");
      if (FUNCTION_EFFECTS.has(prefix)) {
        record(fn, FUNCTION_EFFECTS.get(prefix)!, `${callName}()`, line);
        return;
      }
    }
  }
}

function record(fn: FunctionEffects, effect: Effect, evidence: string, line: number): void {
  fn.effects.add(effect);
  fn.evidence.push(`${evidence} (line ${line})`);
}

// ---------------------------------------------------------------------------
// Effect propagation (pass 2)
// ---------------------------------------------------------------------------

function propagateEffects(functions: FunctionEffects[], structure: ModuleStructure): void {
  const fnByName = new Map<string, FunctionEffects>();
  for (const fn of functions) {
    fnByName.set(fn.name, fn);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of functions) {
      for (const call of fn.calls) {
        const calleeName = resolveIntraModuleCall(fn.name, call, structure);
        const callee = calleeName ? fnByName.get(calleeName) : undefined;
        if (callee && callee !== fn) {
          for (const effect of callee.effects) {
            if (!fn.effects.has(effect)) {
              fn.effects.add(effect);
              fn.evidence.push(`calls ${callee.name} (line ${callee.line})`);
              changed = true;
            }
          }
        }
      }
    }
  }

  // Update pure flag after propagation
  for (const fn of functions) {
    fn.pure = fn.effects.size === 0;
  }
}

function resolveIntraModuleCall(
  callerName: string,
  callName: string,
  structure: ModuleStructure,
): string | null {
  const parts = callName.split(".");

  // this.method()
  if (parts.length === 2 && parts[0] === "this") {
    const method = parts[1];
    const owner = structure.functionOwner.get(callerName);
    if (owner && structure.classMethods.get(owner)?.has(method)) {
      return method;
    }
  }

  // ClassName.method()
  if (parts.length === 2 && structure.classMethods.has(parts[0])) {
    if (structure.classMethods.get(parts[0])!.has(parts[1])) {
      return parts[1];
    }
  }

  // bare function()
  if (parts.length === 1 && !structure.functionOwner.has(parts[0])) {
    return parts[0];
  }

  return null;
}
