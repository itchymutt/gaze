# Gaze

Every function tells you what it does to the world.

Ten effects. Fixed vocabulary. Not extensible.

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
| `Unsafe` | Subprocess, exec, eval, FFI |
| `Fail` | Can fail |

## Three implementations, one vocabulary

| Component | What it does | Language |
|---|---|---|
| **gaze** | Compiler. Effects enforced at compile time. | Rust |
| **libgaze** | Static analyzer for Python. Effects detected and reported. | Python |
| **libgaze-ts** | Static analyzer for TypeScript. Same vocabulary, different AST. | TypeScript |

The vocabulary is the contribution. The implementations prove it works.

## Quick start

### Analyze Python code

```bash
cd libgaze
pip install -e .
libgaze check your_file.py
```

### Analyze TypeScript code

```bash
cd libgaze-ts
npm install && npx tsc
node dist/src/cli.js check your_file.ts
```

### Run the Gaze language

```bash
cd gaze
cargo install --path .
gaze run examples/hello.gaze
```

## What the analyzers find

```
$ libgaze check code_interpreter.py

_run:194  can Fs, Net, Unsafe
    calls run_code_unsafe (line 347)
    calls run_code_safety (line 281)
run_code_unsafe:347  can Unsafe
    os.system(f"pip install {library}")
    exec(code, {}, exec_locals)
```

Two-pass analysis: walk the AST to detect direct effects, then propagate through the intra-module call graph. If `_run()` calls `self.run_code_unsafe()`, it inherits `Unsafe`.

## Scale

Scanned 3,211 files and 15,293 functions across seven real repos (CrewAI, LangChain, AutoGPT, MCP Servers, Vercel AI SDK, OpenAI Agents JS). The vocabulary didn't change between Python and TypeScript. Not one effect was added, removed, or renamed.

| | Python | TypeScript |
|---|---|---|
| Files | 1,604 | 1,607 |
| Functions | 12,511 | 2,782 |
| Pure | 66% | 78% |

Labeled benchmarks: 101 Python functions, 54 TypeScript functions. 100% precision, 100% recall on both.

## CI gate

```yaml
- uses: itchymutt/gaze/action@main
  with:
    path: src/tools/
    deny: Unsafe
```

## The language

```gaze
fn read_config(path: String) can Fs -> Config {
    let text = fs.read(path)
    parse(text)
}

fn transform(data: Config) -> Result {
    // no `can` clause = pure
    // calling fs.read() here is a compile error
}
```

The language is the proof that the vocabulary holds together as a complete programming model. 75 tests. See `gaze/` and `TUTORIAL.md`.

## License

MIT.
