# libgaze-ts

See what your code does to the world before it runs.

```
$ libgaze check server.ts

server.ts  can Env, Fs, Net

  loadConfig:12  can Env, Fs
    readFileSync() (line 14)
    process.env (line 13)
  startServer:24  can Net
    fetch() (line 28)
  transform:35  (pure)

1/3 functions are pure.
```

libgaze-ts is a static effect analyzer for TypeScript. Same ten effects as [libgaze](../libgaze/) (Python), same two-pass architecture, different AST.

## Install

```bash
npm install libgaze
```

## Usage

```bash
# Check a file
libgaze check myfile.ts

# JSON output
libgaze check myfile.ts --json

# Scan a directory
libgaze scan src/

# Fail if denied effects are found (CI gate)
libgaze scan src/ --deny Unsafe,Db
```

## The ten effects

| Effect | What it means |
|--------|--------------|
| `Net` | Touches the network (fetch, http, axios, openai, etc.) |
| `Fs` | Reads or writes files (fs, fs/promises, fs-extra) |
| `Db` | Queries a database (pg, prisma, redis, mongodb, etc.) |
| `Console` | Terminal I/O (console.log, readline, inquirer, chalk) |
| `Env` | Reads environment (process.env, dotenv) |
| `Time` | Clock or sleep (setTimeout, Date.now, performance.now) |
| `Rand` | Randomness (Math.random, crypto.randomUUID) |
| `Async` | Concurrency (worker_threads, child_process) |
| `Unsafe` | eval, new Function, vm module |
| `Fail` | Can exit (process.exit) |

## Benchmark

54 functions across 4 files. Stdlib patterns, class method propagation, edge cases, pure code.

```
precision  100.0%
recall     100.0%
F1         100.0%
```

Scale scan: 1,607 files and 2,782 functions across MCP Servers, Vercel AI SDK, and OpenAI Agents JS. Zero parse failures.

```bash
npx tsc && node dist/bench/run.js        # labeled benchmark
npx tsc && node dist/bench/scan_repos.js  # scale scan
```

## How it works

Same architecture as libgaze (Python):

1. **AST walk.** Detect effects from known functions (`fetch`, `readFileSync`, `console.log`) and module imports (`openai`, `pg`, `node:fs`).
2. **Call graph propagation.** Trace `this.method()`, `ClassName.method()`, and bare `function()` calls within the same file. Iterate until stable.

Uses [ts-morph](https://ts-morph.com/) for TypeScript parsing.

## Limitations

Same boundaries as the Python analyzer. Catches direct calls and intra-module propagation. Misses method calls on injected objects, dynamic property access, and cross-file analysis.

## Part of Gaze

libgaze-ts is the TypeScript effect analyzer from the [Gaze project](https://github.com/itchymutt/gaze). The ten effects are the same vocabulary in the Gaze language (compiler-enforced), libgaze (Python), and libgaze-ts (TypeScript).
