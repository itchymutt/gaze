# Gaze

Every function tells you what it does to the world.

```gaze
fn summarize(order: Order) -> Summary {
    let subtotal = line_total(order.a) + line_total(order.b)
    subtotal |> apply_discount(Percent(10))
}
```

No `can` clause. This function is pure — it takes values, returns values, touches nothing.

```gaze
fn main() can Console {
    print(summarize(order))
}
```

`can Console` means this function writes to the terminal. The compiler enforces it. If you try to `print` from a pure function:

```
error: `print` requires `can Console`
  --> app.gaze:4:5
   |
4  |     print(total)
   |     ^^^^^ this function performs Console effects
   |
   = help: add `can Console` to the function signature:
   |
   |  fn summarize() can Console {
```

Effects propagate. If `process()` calls `fetch()` which has `can Net`, then `process()` must declare `can Net` too. You can't hide effects. A pure signature is a proof.

## Status

Gaze is a prototype. It's not ready for real use. The interpreter runs programs, checks effects, and formats code, but the language has no standard library, no package manager, no modules, no loops, and no string operations beyond literals. It's an exploration of effect-tracked programming, not a production tool.

## Install

```
cargo install --path gaze
```

Requires [Rust](https://rustup.rs).

## Try it

```bash
# Run a program
gaze run examples/hello.gaze

# Check effects without running
gaze check examples/invoice.gaze

# Machine-readable effect manifest
gaze audit examples/invoice.gaze

# Format (one style, not configurable)
gaze fmt file.gaze
```

`gaze check` output:

```
examples/invoice.gaze: ok
  Item  struct
  Discount  enum(Percent, Fixed, None)
  line_total  (pure)
  apply_discount  (pure)
  main  can Console
```

## The ten effects

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
| `Unsafe` | Raw pointers or FFI |
| `Fail` | Can fail |

Fixed vocabulary. Not extensible. Every program's effects are comparable, auditable, and enforceable by CI.

## What works today

- Functions with parameters and return values
- `let` bindings, arithmetic, comparisons
- Structs with field access
- Enums with pattern matching and destructuring
- Pipeline operator `|>`
- `if`/`else` expressions
- Effect declarations with `can`
- Effect propagation through the call graph
- Error messages with source context and fix suggestions
- 75 tests

## What doesn't work yet

- Standard library (no real Net, Fs, Db, etc.)
- Modules and imports
- Loops and iteration
- Generics
- String operations
- Error handling (`fail`, `catch`, `?`)
- Capability narrowing

## Examples

See `examples/` — all of these run:

- `hello.gaze` — the simplest program
- `calc.gaze` — arithmetic and user functions
- `structs.gaze` — struct definitions and field access
- `enums.gaze` — enums and pattern matching
- `pipes.gaze` — the pipeline operator
- `ifelse.gaze` — conditional expressions
- `invoice.gaze` — pure business logic with every feature

## License

MIT.
