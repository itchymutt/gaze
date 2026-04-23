"""Tests for the effect analyzer."""

from pathlib import Path

from liblux import Effect, analyze_file, analyze_source

FIXTURES = Path(__file__).parent / "fixtures"


class TestPureModule:
    def test_all_functions_are_pure(self):
        result = analyze_file(FIXTURES / "pure.py")
        assert len(result.all_effects) == 0
        assert len(result.pure_functions) == 3
        assert len(result.effectful_functions) == 0

    def test_function_names(self):
        result = analyze_file(FIXTURES / "pure.py")
        names = {fn.name for fn in result.functions}
        assert names == {"add", "greet", "summarize"}


class TestMixedModule:
    def test_detects_net_effect(self):
        result = analyze_file(FIXTURES / "mixed.py")
        fn = next(f for f in result.functions if f.name == "fetch_data")
        assert Effect.NET in fn.effects

    def test_detects_fs_effect_on_open(self):
        result = analyze_file(FIXTURES / "mixed.py")
        fn = next(f for f in result.functions if f.name == "load_config")
        assert Effect.FS in fn.effects

    def test_detects_env_effect(self):
        result = analyze_file(FIXTURES / "mixed.py")
        fn = next(f for f in result.functions if f.name == "get_api_key")
        assert Effect.ENV in fn.effects

    def test_transform_is_pure(self):
        result = analyze_file(FIXTURES / "mixed.py")
        fn = next(f for f in result.functions if f.name == "transform")
        assert fn.is_pure

    def test_detects_fs_on_pathlib_write(self):
        result = analyze_file(FIXTURES / "mixed.py")
        fn = next(f for f in result.functions if f.name == "save_report")
        assert Effect.FS in fn.effects

    def test_main_has_multiple_effects(self):
        result = analyze_file(FIXTURES / "mixed.py")
        fn = next(f for f in result.functions if f.name == "main")
        assert Effect.CONSOLE in fn.effects  # print()

    def test_module_level_effects_from_imports(self):
        result = analyze_file(FIXTURES / "mixed.py")
        assert Effect.NET in result.module_level_effects  # import requests
        assert Effect.FS in result.module_level_effects  # from pathlib import Path


class TestAgentCode:
    def test_detects_unsafe_subprocess(self):
        result = analyze_file(FIXTURES / "agent.py")
        fn = next(f for f in result.functions if f.name == "run_command")
        assert Effect.UNSAFE in fn.effects

    def test_detects_env_and_fs(self):
        result = analyze_file(FIXTURES / "agent.py")
        fn = next(f for f in result.functions if f.name == "read_secrets")
        assert Effect.FS in fn.effects
        assert Effect.ENV in fn.effects

    def test_detects_unsafe_exfiltration(self):
        result = analyze_file(FIXTURES / "agent.py")
        fn = next(f for f in result.functions if f.name == "exfiltrate")
        assert Effect.UNSAFE in fn.effects

    def test_detects_db_and_unsafe(self):
        result = analyze_file(FIXTURES / "agent.py")
        fn = next(f for f in result.functions if f.name == "backdoor_db")
        assert Effect.DB in fn.effects
        assert Effect.UNSAFE in fn.effects  # eval()

    def test_no_pure_functions_in_agent(self):
        result = analyze_file(FIXTURES / "agent.py")
        assert len(result.pure_functions) == 0


class TestSourceString:
    def test_analyze_source_string(self):
        source = """
import requests

def fetch(url):
    return requests.get(url)

def add(a, b):
    return a + b
"""
        result = analyze_source(source, path="test.py")
        assert len(result.functions) == 2

        fetch = next(f for f in result.functions if f.name == "fetch")
        assert Effect.NET in fetch.effects

        add = next(f for f in result.functions if f.name == "add")
        assert add.is_pure

    def test_print_is_console(self):
        source = """
def hello():
    print("hello")
"""
        result = analyze_source(source)
        fn = result.functions[0]
        assert Effect.CONSOLE in fn.effects

    def test_open_is_fs(self):
        source = """
def read_file(path):
    with open(path) as f:
        return f.read()
"""
        result = analyze_source(source)
        fn = result.functions[0]
        assert Effect.FS in fn.effects
