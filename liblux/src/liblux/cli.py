"""
liblux CLI.

Usage:
    liblux check <file.py>              Report effects in a Python file
    liblux check <file.py> --json       Output as JSON manifest
    liblux policy <file.py> -p .luxpolicy   Check against a policy file
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .analyzer import ModuleEffects, analyze_file
from .policy import check_policy, load_policy


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="liblux",
        description="See what your code does to the world before it runs.",
    )
    subparsers = parser.add_subparsers(dest="command")

    # check command
    check_parser = subparsers.add_parser(
        "check", help="Report effects in a Python file"
    )
    check_parser.add_argument("file", type=Path, help="Python file to analyze")
    check_parser.add_argument(
        "--json", action="store_true", dest="json_output", help="Output as JSON"
    )
    check_parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show evidence for each effect"
    )

    # policy command
    policy_parser = subparsers.add_parser(
        "policy", help="Check a file against an effect policy"
    )
    policy_parser.add_argument("file", type=Path, help="Python file to analyze")
    policy_parser.add_argument(
        "--policy", "-p", type=Path, required=True, help="Policy file (.luxpolicy)"
    )
    policy_parser.add_argument(
        "--json", action="store_true", dest="json_output", help="Output as JSON"
    )

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    if args.command == "check":
        run_check(args)
    elif args.command == "policy":
        run_policy(args)


def run_check(args: argparse.Namespace) -> None:
    if not args.file.exists():
        print(f"error: {args.file} not found", file=sys.stderr)
        sys.exit(1)

    result = analyze_file(args.file)

    if args.json_output:
        print(json.dumps(to_json(result), indent=2))
    else:
        print_report(result, verbose=args.verbose)


def run_policy(args: argparse.Namespace) -> None:
    if not args.file.exists():
        print(f"error: {args.file} not found", file=sys.stderr)
        sys.exit(1)
    if not args.policy.exists():
        print(f"error: {args.policy} not found", file=sys.stderr)
        sys.exit(1)

    result = analyze_file(args.file)
    policy = load_policy(args.policy)
    violations = check_policy(result, policy)

    if args.json_output:
        print(json.dumps({
            "file": str(args.file),
            "policy": str(args.policy),
            "pass": len(violations) == 0,
            "violations": [v.to_dict() for v in violations],
        }, indent=2))
    else:
        if violations:
            print(f"FAIL  {args.file}")
            print()
            for v in violations:
                print(f"  {v}")
            print()
            print(f"{len(violations)} violation(s) found.")
            sys.exit(1)
        else:
            print(f"PASS  {args.file}")


def print_report(result: ModuleEffects, verbose: bool = False) -> None:
    effects = result.all_effects
    if not effects:
        print(f"{result.path}  (pure)")
        return

    effect_str = ", ".join(sorted(str(e) for e in effects))
    print(f"{result.path}  can {effect_str}")
    print()

    for fn in result.functions:
        if fn.is_pure:
            print(f"  {fn.name}:{fn.lineno}  (pure)")
        else:
            fn_effects = ", ".join(sorted(str(e) for e in fn.effects))
            print(f"  {fn.name}:{fn.lineno}  can {fn_effects}")
            if verbose:
                for ev in fn.evidence:
                    print(f"    {ev}")

    if result.module_level_effects:
        print()
        mod_effects = ", ".join(
            sorted(str(e) for e in result.module_level_effects)
        )
        print(f"  (module level)  can {mod_effects}")

    # Summary
    pure_count = len(result.pure_functions)
    total = len(result.functions)
    if total > 0:
        print()
        print(f"{pure_count}/{total} functions are pure.")


def to_json(result: ModuleEffects) -> dict:
    return {
        "file": result.path,
        "effects": sorted(str(e) for e in result.all_effects),
        "functions": [
            {
                "name": fn.name,
                "line": fn.lineno,
                "effects": sorted(str(e) for e in fn.effects),
                "pure": fn.is_pure,
                "evidence": fn.evidence,
                "calls": fn.calls,
            }
            for fn in result.functions
        ],
        "module_level_effects": sorted(
            str(e) for e in result.module_level_effects
        ),
    }
