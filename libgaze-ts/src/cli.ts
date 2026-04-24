#!/usr/bin/env node

/**
 * libgaze CLI for TypeScript.
 *
 * Usage:
 *   libgaze check <file.ts>
 *   libgaze check <file.ts> --json
 *   libgaze check <file.ts> --deny Unsafe,Db
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeFilePath } from "./analyzer.js";
import type { ModuleEffects } from "./analyzer.js";

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  console.log(`libgaze — See what your code does to the world before it runs.

Usage:
  libgaze check <file.ts>              Report effects
  libgaze check <file.ts> --json       Output as JSON
  libgaze check <file.ts> --deny X,Y   Fail if effects found
  libgaze scan <dir>                   Scan all TS files
  libgaze scan <dir> --deny X          Fail if effects found`);
  process.exit(0);
}

if (command === "check") {
  const filePath = args[1];
  if (!filePath) {
    console.error("error: missing file path");
    process.exit(1);
  }

  const jsonOutput = args.includes("--json");
  const denyIdx = args.indexOf("--deny");
  const denyEffects = denyIdx >= 0 ? args[denyIdx + 1]?.split(",") : null;

  const result = analyzeFilePath(resolve(filePath));

  if (jsonOutput) {
    console.log(JSON.stringify(toJson(result), null, 2));
  } else {
    printReport(result);
  }

  if (denyEffects) {
    const denied = new Set(denyEffects);
    const found = [...result.allEffects].filter(e => denied.has(e));
    if (found.length > 0) {
      console.log(`\nFAIL  denied effects found: ${found.sort().join(", ")}`);
      process.exit(1);
    }
  }
} else if (command === "scan") {
  const dirPath = args[1];
  if (!dirPath) {
    console.error("error: missing directory path");
    process.exit(1);
  }

  const denyIdx = args.indexOf("--deny");
  const denyEffects = denyIdx >= 0 ? args[denyIdx + 1]?.split(",") : null;
  const quiet = args.includes("--quiet") || args.includes("-q");

  const files = collectTsFiles(resolve(dirPath));
  const results: ModuleEffects[] = [];

  for (const f of files) {
    try {
      results.push(analyzeFilePath(f));
    } catch {
      // skip files that don't parse
    }
  }

  const effectful = results.filter(r => r.allEffects.size > 0);
  const pure = results.filter(r => r.allEffects.size === 0);

  for (const r of effectful) {
    const effects = [...r.allEffects].sort().join(", ");
    const pureCount = r.functions.filter(f => f.pure).length;
    console.log(`  ${r.path}  can ${effects}  (${pureCount}/${r.functions.length} pure)`);
  }

  if (!quiet && pure.length > 0) {
    console.log();
    for (const r of pure) {
      console.log(`  ${r.path}  (pure)`);
    }
  }

  console.log();
  console.log(`${results.length} files scanned. ${effectful.length} effectful, ${pure.length} pure.`);

  if (denyEffects) {
    const denied = new Set(denyEffects);
    const violations: string[] = [];
    for (const r of results) {
      const found = [...r.allEffects].filter(e => denied.has(e));
      if (found.length > 0) {
        violations.push(`  ${r.path}: ${found.sort().join(", ")}`);
      }
    }
    if (violations.length > 0) {
      console.log("\nFAIL  denied effects found:");
      for (const v of violations) console.log(v);
      process.exit(1);
    }
  }
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------

function printReport(result: ModuleEffects): void {
  if (result.allEffects.size === 0) {
    console.log(`${result.path}  (pure)`);
    return;
  }

  const effects = [...result.allEffects].sort().join(", ");
  console.log(`${result.path}  can ${effects}`);
  console.log();

  const source = readFileSync(result.path, "utf-8");
  const lines = source.split("\n");

  for (const fn of result.functions) {
    if (fn.pure) {
      console.log(`  ${fn.name}:${fn.line}  (pure)`);
    } else {
      const fnEffects = [...fn.effects].sort().join(", ");
      console.log(`  ${fn.name}:${fn.line}  can ${fnEffects}`);
      for (const ev of fn.evidence) {
        const lineMatch = ev.match(/\(line (\d+)\)/);
        if (lineMatch) {
          const lineNo = parseInt(lineMatch[1]);
          if (lineNo > 0 && lineNo <= lines.length) {
            console.log(`    ${lineNo} | ${lines[lineNo - 1].trim()}`);
          }
        }
      }
    }
  }

  if (result.moduleEffects.size > 0) {
    console.log();
    const modEffects = [...result.moduleEffects].sort().join(", ");
    console.log(`  (module level)  can ${modEffects}`);
  }

  const pureCount = result.functions.filter(f => f.pure).length;
  const total = result.functions.length;
  if (total > 0) {
    console.log();
    console.log(`${pureCount}/${total} functions are pure.`);
  }
}

function toJson(result: ModuleEffects) {
  return {
    file: result.path,
    effects: [...result.allEffects].sort(),
    functions: result.functions.map(fn => ({
      name: fn.name,
      line: fn.line,
      effects: [...fn.effects].sort(),
      pure: fn.pure,
      evidence: fn.evidence,
      calls: fn.calls,
    })),
    moduleEffects: [...result.moduleEffects].sort(),
  };
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  const skip = new Set(["node_modules", ".git", "dist", "build", ".next", "__tests__"]);

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".spec.ts")) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results.sort();
}
