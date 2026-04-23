# liblux

See what your code does to the world before it runs.

```
$ liblux check agent.py

agent.py  can Db, Env, Fs, Unsafe

  run_command:8       can Unsafe
  read_secrets:13     can Env, Fs
  exfiltrate:24       can Unsafe
  backdoor_db:29      can Db, Unsafe

0/4 functions are pure.
```

liblux is a static effect analyzer for Python. It scans your code and reports which of 10 effects each function performs: Net, Fs, Db, Console, Env, Time, Rand, Async, Unsafe, Fail.

## Install

```
pip install liblux
```

## Usage

### Check a file

```
liblux check myfile.py
liblux check myfile.py --json
liblux check myfile.py --verbose
```

### Check against a policy

```
liblux policy myfile.py --policy .luxpolicy
```

A `.luxpolicy` file declares which effects are allowed or denied:

```json
{
    "deny": ["Unsafe", "Db"],
    "functions": {
        "transform": { "allow": [] }
    }
}
```

## The Ten Effects

| Effect | What it means |
|--------|--------------|
| `Net` | Touches the network |
| `Fs` | Reads or writes files |
| `Db` | Queries or mutates a database |
| `Console` | Reads or writes the terminal |
| `Env` | Reads environment variables |
| `Time` | Reads the clock or sleeps |
| `Rand` | Generates random numbers |
| `Async` | Spawns concurrent tasks |
| `Unsafe` | Raw pointers, FFI, eval, subprocess |
| `Fail` | Can fail (sys.exit, etc.) |

## Limitations

liblux uses static AST analysis. Python is dynamic. liblux catches the common patterns (imports, stdlib calls, well-known libraries) but cannot catch effects hidden behind `getattr`, dynamic imports, or metaclass magic. It's a first line of defense, not a proof.

## Part of Lux

liblux is the effect checker from the [Lux programming language](https://github.com/itchymutt/lux), extracted as a standalone library. In Lux, effects are enforced by the compiler. In Python, liblux reports them as a static analysis tool.
