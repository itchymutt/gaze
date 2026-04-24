# Gaze Roadmap

## What exists today

A tree-walk interpreter in Rust (~3,100 lines, 75 tests) that runs Gaze programs with effect checking.

**Working:**
- [x] Lexer, parser, interpreter
- [x] Functions, let bindings, arithmetic, comparisons
- [x] Structs with field access
- [x] Enums with pattern matching and destructuring
- [x] Pipeline operator `|>`
- [x] `if`/`else` expressions
- [x] Effect declarations (`can`) and propagation through call graph
- [x] `gaze run` — execute a program
- [x] `gaze check` — verify effects without running
- [x] `gaze audit` — JSON effect manifest
- [x] `gaze fmt` — canonical formatter
- [x] Error messages with source context, carets, fix suggestions

**Not working yet:**
- [ ] Standard library (Net, Fs, Db, etc. are declared but not implemented)
- [ ] Modules and imports
- [ ] Loops and iteration
- [ ] Generics (`List<T>`, `Option<T>`)
- [ ] String operations beyond literals
- [ ] Error handling (`fail`, `catch`, `?`)
- [ ] Capability narrowing
- [ ] REPL

## What's next

### Near term: make it tryable

The language is interesting enough to show people but too hard to try. Priority is reducing the distance between "this looks interesting" and "I tried it."

- [ ] `cargo install` works from the repo
- [ ] 2-minute tutorial (TUTORIAL.md)
- [ ] Show it to 5 people who build AI agent frameworks. Ask: "would you use this?"

### Medium term: make it real

The features needed to write non-trivial programs:

- [ ] String operations (concatenation, interpolation, length, slicing)
- [ ] Arrays/lists with iteration
- [ ] Modules and imports
- [ ] Error handling (`fail`, `?`, `catch`)
- [ ] Runtime effect modules (actual Net, Fs, Console implementations)
- [ ] REPL

### Long term: make it fast

- [ ] Bytecode compiler + VM (Lua/Python approach)
- [ ] Native compilation (LLVM or Cranelift)
- [ ] Perceus reference counting
- [ ] Package manager
- [ ] LSP server

### Eventually: extract the library

The effect system as a standalone Rust library (`libgaze`) that works beyond Gaze. Language-specific analyzers for Python, TypeScript, Rust. AI agent protocol integration. This is the lasting contribution — but it comes from a working language, not before it.

## Implementation principles

1. **Store byte offsets, not line/column.** Reconstruct on error. The Zig pattern.
2. **Sprint to demos.** Each feature proves the design works for one more program.
3. **The compiler is the harness.** Every rule that lives in the compiler is a rule that never needs to be re-taught.
4. **You have to feel it.** The interpreter isn't done when the tests pass. It's done when writing Gaze feels right.
