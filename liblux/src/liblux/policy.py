"""
Effect policy checking.

A .luxpolicy file declares which effects are allowed (or denied) for a module.
liblux checks the analyzed effects against the policy and reports violations.

Policy format (JSON):
{
    "allow": ["Net", "Fail"],           // only these effects are permitted
    "deny": ["Unsafe", "Db"],           // these effects are forbidden
    "functions": {
        "process_data": { "allow": [] } // this function must be pure
    }
}

Rules:
- If "allow" is present, any effect NOT in the list is a violation.
- If "deny" is present, any effect IN the list is a violation.
- "allow" and "deny" are mutually exclusive at each level.
- Function-level policies override module-level policies.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .analyzer import ModuleEffects
from .effects import Effect


@dataclass
class Policy:
    allow: set | None = None
    deny: set | None = None
    functions: dict | None = None


@dataclass
class PolicyViolation:
    function: str
    line: int
    effect: Effect
    reason: str

    def to_dict(self) -> dict:
        return {
            "function": self.function,
            "line": self.line,
            "effect": str(self.effect),
            "reason": self.reason,
        }

    def __str__(self) -> str:
        return f"{self.function}:{self.line}  {self.effect} -- {self.reason}"


def load_policy(path: Path) -> Policy:
    data = json.loads(path.read_text())
    return _parse_policy(data)


def _parse_policy(data: dict) -> Policy:
    allow = None
    deny = None
    functions = None

    if "allow" in data:
        allow = {Effect(e) for e in data["allow"]}
    if "deny" in data:
        deny = {Effect(e) for e in data["deny"]}
    if "functions" in data:
        functions = {
            name: _parse_policy(fn_data)
            for name, fn_data in data["functions"].items()
        }

    if allow is not None and deny is not None:
        raise ValueError("Policy cannot have both 'allow' and 'deny' at the same level")

    return Policy(allow=allow, deny=deny, functions=functions)


def check_policy(result: ModuleEffects, policy: Policy) -> list[PolicyViolation]:
    violations: list[PolicyViolation] = []

    for fn in result.functions:
        # Check function-level policy first
        fn_policy = None
        if policy.functions and fn.name in policy.functions:
            fn_policy = policy.functions[fn.name]

        active_policy = fn_policy or policy

        for effect in fn.effects:
            violation = _check_effect(active_policy, effect, fn.name, fn.lineno)
            if violation:
                violations.append(violation)

    # Check module-level effects
    for effect in result.module_level_effects:
        violation = _check_effect(policy, effect, "(module level)", 0)
        if violation:
            violations.append(violation)

    return violations


def _check_effect(
    policy: Policy, effect: Effect, fn_name: str, lineno: int
) -> PolicyViolation | None:
    if policy.allow is not None and effect not in policy.allow:
        return PolicyViolation(
            function=fn_name,
            line=lineno,
            effect=effect,
            reason=f"not in allowed effects: {{{', '.join(str(e) for e in sorted(policy.allow))}}}",
        )
    if policy.deny is not None and effect in policy.deny:
        return PolicyViolation(
            function=fn_name,
            line=lineno,
            effect=effect,
            reason="explicitly denied by policy",
        )
    return None
