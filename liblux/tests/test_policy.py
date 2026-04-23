"""Tests for policy checking."""

from pathlib import Path

from liblux import Effect, analyze_file, check_policy, load_policy

FIXTURES = Path(__file__).parent / "fixtures"


class TestPolicyLoading:
    def test_load_deny_policy(self):
        policy = load_policy(FIXTURES / "sample.luxpolicy")
        assert policy.deny == {Effect.UNSAFE, Effect.DB}
        assert policy.allow is None

    def test_function_level_policy(self):
        policy = load_policy(FIXTURES / "sample.luxpolicy")
        assert "transform" in policy.functions
        assert policy.functions["transform"].allow == set()


class TestPolicyChecking:
    def test_pure_module_passes_any_policy(self):
        result = analyze_file(FIXTURES / "pure.py")
        policy = load_policy(FIXTURES / "sample.luxpolicy")
        violations = check_policy(result, policy)
        assert len(violations) == 0

    def test_agent_code_violates_deny_policy(self):
        result = analyze_file(FIXTURES / "agent.py")
        policy = load_policy(FIXTURES / "sample.luxpolicy")
        violations = check_policy(result, policy)
        # Should catch Unsafe and Db effects
        effects_found = {v.effect for v in violations}
        assert Effect.UNSAFE in effects_found
        assert Effect.DB in effects_found

    def test_function_purity_enforcement(self):
        result = analyze_file(FIXTURES / "mixed.py")
        policy = load_policy(FIXTURES / "sample.luxpolicy")
        violations = check_policy(result, policy)
        # transform is required to be pure by the policy, and it is pure
        transform_violations = [v for v in violations if v.function == "transform"]
        assert len(transform_violations) == 0
