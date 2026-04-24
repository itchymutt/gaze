"""
Static effect analyzer for Python source code.

Two-pass analysis:
1. Walk the AST. Detect direct effects from known functions and modules.
   Record every call site for the call graph.
2. Propagate effects through intra-module calls. If function A calls
   function B (via self.method(), ClassName.method(), or bare name()),
   A inherits B's effects. Iterate until stable.

This is conservative: we report the effects we can detect, not the effects
we can prove. Python is dynamic. libgaze catches direct calls to known
functions and traces through the module's own call graph. It cannot trace
method calls on injected objects (container.exec_run(), self.driver.get()).
Silence doesn't mean safe.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from pathlib import Path
from typing import Union

from .effects import (
    ATTRIBUTE_EFFECTS,
    FUNCTION_EFFECTS,
    MODULE_EFFECTS,
    Effect,
)


@dataclass
class FunctionEffects:
    """The effects detected in a single function."""

    name: str
    lineno: int
    effects: set[Effect] = field(default_factory=set)
    calls: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)

    @property
    def is_pure(self) -> bool:
        return len(self.effects) == 0


@dataclass
class ModuleEffects:
    """The effects detected in an entire module (file)."""

    path: str
    source: str = ""
    functions: list[FunctionEffects] = field(default_factory=list)
    module_level_effects: set[Effect] = field(default_factory=set)
    imports: dict = field(default_factory=dict)

    @property
    def all_effects(self) -> set[Effect]:
        effects = set(self.module_level_effects)
        for fn in self.functions:
            effects |= fn.effects
        return effects

    @property
    def pure_functions(self) -> list[FunctionEffects]:
        return [f for f in self.functions if f.is_pure]

    @property
    def effectful_functions(self) -> list[FunctionEffects]:
        return [f for f in self.functions if not f.is_pure]


# ---------------------------------------------------------------------------
# Module structure: tracks which functions belong to which classes
# ---------------------------------------------------------------------------

@dataclass
class ModuleStructure:
    """The class/function topology of a module, built during the AST walk."""

    class_methods: dict[str, set[str]] = field(default_factory=dict)
    function_owner: dict[str, str] = field(default_factory=dict)

    def register_class(self, name: str) -> None:
        self.class_methods.setdefault(name, set())

    def register_method(self, fn_name: str, class_name: str) -> None:
        self.class_methods.setdefault(class_name, set()).add(fn_name)
        self.function_owner[fn_name] = class_name

    def resolve(self, caller_name: str, call_name: str) -> str | None:
        """Resolve a call to a function name defined in this module.

        Returns the function name if it can be resolved, None otherwise.

        Handles three patterns:
          self.method()       -> method in caller's class
          ClassName.method()  -> method in that class
          function()          -> module-level function (not a method)
        """
        parts = call_name.split(".", 1)

        if len(parts) == 2:
            obj, method = parts

            # self.method()
            if obj == "self":
                owner = self.function_owner.get(caller_name)
                if owner and method in self.class_methods.get(owner, set()):
                    return method

            # ClassName.method()
            if obj in self.class_methods and method in self.class_methods[obj]:
                return method

        elif len(parts) == 1:
            # bare function() -- only if it's NOT a class method
            if parts[0] not in self.function_owner:
                return parts[0]

        return None


# ---------------------------------------------------------------------------
# AST visitor (pass 1)
# ---------------------------------------------------------------------------

class EffectAnalyzer(ast.NodeVisitor):
    """Walk a Python AST and detect effects from known functions and modules."""

    def __init__(self, source_path: str = "<unknown>"):
        self.result = ModuleEffects(path=source_path)
        self.structure = ModuleStructure()
        self._current_function: FunctionEffects | None = None
        self._current_class: str | None = None
        self._imports: dict[str, str] = {}

    def analyze(self, source: str) -> ModuleEffects:
        self.result.source = source
        tree = ast.parse(source)
        self.visit(tree)
        self.result.imports = dict(self._imports)
        _propagate_effects(self.result, self.structure)
        return self.result

    def analyze_file(self, path: Path) -> ModuleEffects:
        self.result.path = str(path)
        return self.analyze(path.read_text())

    # --- Imports ---

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            name = alias.asname or alias.name
            self._imports[name] = alias.name
            self._check_module_import(alias.name, node.lineno)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        for alias in node.names:
            full_name = f"{module}.{alias.name}" if module else alias.name
            local_name = alias.asname or alias.name
            self._imports[local_name] = full_name
            self._check_module_import(module, node.lineno)
            self._check_function_import(full_name, node.lineno)
        self.generic_visit(node)

    def _check_module_import(self, module: str, lineno: int) -> None:
        for pattern, effect in MODULE_EFFECTS.items():
            if module == pattern or module.startswith(pattern + "."):
                self._record(effect, f"import {module}", lineno)
                return

    def _check_function_import(self, full_name: str, lineno: int) -> None:
        if full_name in FUNCTION_EFFECTS:
            self._record(FUNCTION_EFFECTS[full_name], f"import {full_name}", lineno)

    # --- Classes ---

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        parent = self._current_class
        self._current_class = node.name
        self.structure.register_class(node.name)
        self.generic_visit(node)
        self._current_class = parent

    # --- Functions ---

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._visit_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        fn = self._visit_function(node)
        fn.effects.add(Effect.ASYNC)
        fn.evidence.append(f"async def {node.name} (line {node.lineno})")

    def _visit_function(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef]) -> FunctionEffects:
        parent = self._current_function
        fn = FunctionEffects(name=node.name, lineno=node.lineno)
        self._current_function = fn
        self.result.functions.append(fn)
        if self._current_class:
            self.structure.register_method(node.name, self._current_class)
        self.generic_visit(node)
        self._current_function = parent
        return fn

    # --- Calls ---

    def visit_Call(self, node: ast.Call) -> None:
        call_name = self._resolve_call(node.func)
        if call_name:
            if self._current_function:
                self._current_function.calls.append(call_name)
            self._check_call_effects(call_name, node.lineno)
        self.generic_visit(node)

    def _resolve_call(self, node: ast.expr) -> str | None:
        if isinstance(node, ast.Name):
            return self._imports.get(node.id, node.id)
        if isinstance(node, ast.Attribute):
            parts = self._resolve_chain(node)
            if parts:
                first = parts[0]
                if first in self._imports:
                    return self._imports[first] + "." + ".".join(parts[1:])
                return ".".join(parts)
        return None

    def _resolve_chain(self, node: ast.expr) -> list[str] | None:
        if isinstance(node, ast.Name):
            return [node.id]
        if isinstance(node, ast.Attribute):
            parent = self._resolve_chain(node.value)
            if parent is not None:
                return [*parent, node.attr]
        return None

    def _check_call_effects(self, call_name: str, lineno: int) -> None:
        # Exact function match
        if call_name in FUNCTION_EFFECTS:
            self._record(FUNCTION_EFFECTS[call_name], f"{call_name}()", lineno)
            return

        # Module prefix match
        parts = call_name.rsplit(".", 1)
        if len(parts) == 2:
            module_part = parts[0]
            for pattern, effect in MODULE_EFFECTS.items():
                if module_part == pattern or module_part.startswith(pattern + "."):
                    self._record(effect, f"{call_name}()", lineno)
                    return

        # Builtin fallback
        builtin_key = f"builtins.{call_name}"
        if builtin_key in FUNCTION_EFFECTS:
            self._record(FUNCTION_EFFECTS[builtin_key], f"{call_name}()", lineno)

    # --- Attribute access ---

    def visit_Attribute(self, node: ast.Attribute) -> None:
        chain = self._resolve_chain(node)
        if chain:
            first = chain[0]
            if first in self._imports:
                dotted = self._imports[first] + "." + ".".join(chain[1:])
            else:
                dotted = ".".join(chain)
            if dotted in ATTRIBUTE_EFFECTS:
                self._record(ATTRIBUTE_EFFECTS[dotted], dotted, node.lineno)
        self.generic_visit(node)

    # --- Recording ---

    def _record(self, effect: Effect, evidence: str, lineno: int) -> None:
        target = self._current_function
        if target:
            target.effects.add(effect)
            target.evidence.append(f"{evidence} (line {lineno})")
        else:
            self.result.module_level_effects.add(effect)


# ---------------------------------------------------------------------------
# Effect propagation (pass 2)
# ---------------------------------------------------------------------------

def _propagate_effects(result: ModuleEffects, structure: ModuleStructure) -> None:
    """Propagate effects through the intra-module call graph until stable.

    If function A calls self.B(), and B has effects, A inherits them.
    Uses a fixpoint iteration: repeat until no new effects are discovered.
    """
    fn_by_name: dict[str, FunctionEffects] = {fn.name: fn for fn in result.functions}

    changed = True
    while changed:
        changed = False
        for fn in result.functions:
            for call in fn.calls:
                callee_name = structure.resolve(fn.name, call)
                callee = fn_by_name.get(callee_name) if callee_name else None
                if callee and callee is not fn:
                    new = callee.effects - fn.effects
                    if new:
                        fn.effects |= new
                        fn.evidence.append(
                            f"calls {callee.name} (line {callee.lineno})"
                        )
                        changed = True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_source(source: str, path: str = "<string>") -> ModuleEffects:
    """Analyze a Python source string and return its effects."""
    return EffectAnalyzer(source_path=path).analyze(source)


def analyze_file(path: Union[str, Path]) -> ModuleEffects:
    """Analyze a Python file and return its effects."""
    path = Path(path)
    return EffectAnalyzer(source_path=str(path)).analyze_file(path)
