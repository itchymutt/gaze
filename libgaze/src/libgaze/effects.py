"""
The ten Gaze effects and their mapping to Python's standard library and ecosystem.

This is the vocabulary. Every entry is a claim:
"using this Python module or function performs this effect."

The mappings are organized by effect, not by module. When adding a new entry,
find the effect it belongs to and add it there.
"""

from enum import Enum


class Effect(str, Enum):
    NET = "Net"
    FS = "Fs"
    DB = "Db"
    CONSOLE = "Console"
    ENV = "Env"
    TIME = "Time"
    RAND = "Rand"
    ASYNC = "Async"
    UNSAFE = "Unsafe"
    FAIL = "Fail"

    def __str__(self) -> str:
        return self.value


# ---------------------------------------------------------------------------
# Module-level effects
#
# Importing or calling anything from these modules implies the effect.
# Matched by prefix: "http" matches "http", "http.client", "http.server".
# ---------------------------------------------------------------------------

_NET_MODULES = [
    # stdlib
    "urllib.request", "urllib.error", "http", "http.client", "http.server",
    "socket", "ssl", "smtplib", "ftplib", "xmlrpc",
    # third-party HTTP
    "requests", "httpx", "aiohttp", "urllib3", "websockets", "grpc",
    # infrastructure
    "paramiko", "fabric", "boto3", "botocore", "google.cloud", "azure",
    # containers and sandboxes
    "docker", "e2b",
    # browser automation
    "selenium", "playwright", "scrapy",
    # LLM clients
    "openai", "anthropic", "cohere", "together", "replicate",
    "huggingface_hub", "transformers",
    # frameworks that imply network (conservative)
    "langchain_community",
]

_FS_MODULES = [
    # stdlib (os.path is NOT here: join/dirname/basename are pure string ops)
    "pathlib", "shutil", "tempfile", "glob", "fnmatch", "fileinput",
    # archives
    "zipfile", "tarfile", "gzip", "bz2", "lzma",
]

_DB_MODULES = [
    # stdlib
    "sqlite3", "dbm", "shelve",
    # postgres
    "psycopg2", "psycopg", "asyncpg",
    # mysql
    "pymysql", "mysql.connector",
    # nosql
    "pymongo", "motor", "redis",
    # ORMs
    "sqlalchemy", "peewee", "tortoise", "databases", "aiosqlite",
]

_CONSOLE_MODULES = [
    "curses", "readline", "getpass",
    "click", "rich", "typer",
]

_ENV_MODULES = [
    "dotenv", "python_dotenv",
]

_TIME_MODULES = [
    "time", "datetime", "sched", "calendar",
]

_RAND_MODULES = [
    "random", "secrets",
]

_ASYNC_MODULES = [
    "asyncio", "threading", "multiprocessing",
    "concurrent", "concurrent.futures",
]

_UNSAFE_MODULES = [
    "ctypes", "cffi", "mmap",
    "pickle", "marshal",
    "importlib",
]

MODULE_EFFECTS: dict[str, Effect] = {}
for _modules, _effect in [
    (_NET_MODULES, Effect.NET),
    (_FS_MODULES, Effect.FS),
    (_DB_MODULES, Effect.DB),
    (_CONSOLE_MODULES, Effect.CONSOLE),
    (_ENV_MODULES, Effect.ENV),
    (_TIME_MODULES, Effect.TIME),
    (_RAND_MODULES, Effect.RAND),
    (_ASYNC_MODULES, Effect.ASYNC),
    (_UNSAFE_MODULES, Effect.UNSAFE),
]:
    for _mod in _modules:
        MODULE_EFFECTS[_mod] = _effect


# ---------------------------------------------------------------------------
# Function-level effects
#
# Specific functions that imply effects. Checked by exact match on the
# resolved call name. Builtins are listed both with and without the
# "builtins." prefix because Python's name resolution can produce either.
# ---------------------------------------------------------------------------

FUNCTION_EFFECTS: dict[str, Effect] = {
    # --- Console ---
    "print": Effect.CONSOLE,
    "input": Effect.CONSOLE,
    "builtins.print": Effect.CONSOLE,
    "builtins.input": Effect.CONSOLE,
    "click.confirm": Effect.CONSOLE,
    "click.prompt": Effect.CONSOLE,
    "click.echo": Effect.CONSOLE,
    "sys.stdin": Effect.CONSOLE,
    "sys.stdout": Effect.CONSOLE,
    "sys.stderr": Effect.CONSOLE,

    # --- Fs ---
    "open": Effect.FS,
    "builtins.open": Effect.FS,
    # os functions that touch the filesystem
    "os.getcwd": Effect.FS,
    "os.chdir": Effect.FS,
    "os.listdir": Effect.FS,
    "os.scandir": Effect.FS,
    "os.mkdir": Effect.FS,
    "os.makedirs": Effect.FS,
    "os.remove": Effect.FS,
    "os.unlink": Effect.FS,
    "os.rmdir": Effect.FS,
    "os.rename": Effect.FS,
    "os.replace": Effect.FS,
    "os.stat": Effect.FS,
    "os.walk": Effect.FS,
    "os.link": Effect.FS,
    "os.symlink": Effect.FS,
    "os.readlink": Effect.FS,
    "os.chmod": Effect.FS,
    "os.chown": Effect.FS,
    # os.path: only functions that stat the filesystem
    # (join, dirname, basename, splitext, split are pure string ops)
    "os.path.exists": Effect.FS,
    "os.path.isfile": Effect.FS,
    "os.path.isdir": Effect.FS,
    "os.path.islink": Effect.FS,
    "os.path.getsize": Effect.FS,
    "os.path.getmtime": Effect.FS,
    "os.path.getatime": Effect.FS,
    "os.path.getctime": Effect.FS,
    "os.path.realpath": Effect.FS,
    "os.path.abspath": Effect.FS,
    "os.path.samefile": Effect.FS,

    # --- Env ---
    "os.getenv": Effect.ENV,
    "os.putenv": Effect.ENV,
    "os.environ": Effect.ENV,
    "os.getpid": Effect.ENV,
    "sys.argv": Effect.ENV,

    # --- Net ---
    "docker.from_env": Effect.NET,

    # --- Unsafe ---
    "exec": Effect.UNSAFE,
    "eval": Effect.UNSAFE,
    "compile": Effect.UNSAFE,
    "__import__": Effect.UNSAFE,
    "builtins.exec": Effect.UNSAFE,
    "builtins.eval": Effect.UNSAFE,
    "builtins.compile": Effect.UNSAFE,
    "builtins.__import__": Effect.UNSAFE,
    "os.system": Effect.UNSAFE,
    "os.popen": Effect.UNSAFE,
    "os.exec": Effect.UNSAFE,
    "os.execv": Effect.UNSAFE,
    "os.execve": Effect.UNSAFE,
    "os.kill": Effect.UNSAFE,
    "subprocess.run": Effect.UNSAFE,
    "subprocess.call": Effect.UNSAFE,
    "subprocess.check_call": Effect.UNSAFE,
    "subprocess.check_output": Effect.UNSAFE,
    "subprocess.Popen": Effect.UNSAFE,
    "importlib.util.find_spec": Effect.UNSAFE,
    "importlib.import_module": Effect.UNSAFE,

    # --- Async ---
    "os.fork": Effect.ASYNC,

    # --- Fail ---
    "sys.exit": Effect.FAIL,
}


# ---------------------------------------------------------------------------
# Attribute access effects
#
# Catches attribute reads like os.environ["KEY"] or sys.argv[0].
# ---------------------------------------------------------------------------

ATTRIBUTE_EFFECTS: dict[str, Effect] = {
    "os.environ": Effect.ENV,
    "sys.argv": Effect.ENV,
    "sys.stdin": Effect.CONSOLE,
    "sys.stdout": Effect.CONSOLE,
    "sys.stderr": Effect.CONSOLE,
}
