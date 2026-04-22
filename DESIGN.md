# Lux: A Language That Shows Its Work

## Thesis

Lux is a general-purpose programming language designed for a world where most code is written by machines and read by humans. Its core belief: **every observable behavior of a program should be visible in its type signature.**

Memory safety is table stakes (solved by Rust, adopted here). The novel contribution is *effect safety*: the compiler tracks what a function does to the world, not just what it returns. A function that touches the network says so. A function that writes to disk says so. A function that mutates shared state says so. Silence means purity.

This matters because AI agents generate plausible code at scale. In languages where side effects are invisible, a "pure" function that secretly makes HTTP calls passes code review (human and automated). In Lux, it doesn't compile.

## Design Principles

1. **Silence is purity.** A function with no effect annotation is pure. It takes values, returns values, touches nothing. This is the default. Effects are opt-in, explicit, and visible.

2. **The signature is the contract.** If you can read the function signature, you know everything the function can do. Not "might do." Can do. The compiler enforces this.

3. **Composition is pipelines.** The primary way to build programs is to compose functions in sequence. Data flows through transformations. Each stage declares its effects. The pipeline is both the program and its security manifest.

4. **Constraints are features.** The language is opinionated about program structure. One way to do most things. The compiler enforces conventions that other languages delegate to linters. This makes AI-generated code predictable and human-reviewed code skimmable.

5. **Two users, one language.** Every program has a human reader and a machine writer. The syntax optimizes for human readability. The structure optimizes for machine generation. These are not in conflict when the language is sufficiently constrained.

## The Effect System

### Core Concept

Every function in Lux has an effect set: the collection of effects it may perform. The effect set is part of the function's type. Functions compose only when their effects are compatible with the calling context.

```lux
// Pure function. No effects. The default.
fn add(a: i32, b: i32) -> i32 {
    a + b
}

// Function with declared effects.
fn fetch_user(id: UserId) -> User ! {Net, Db} {
    let response = http.get("/users/{id}") ! {Net}
    parse_user(response.body)  // pure, no annotation needed
}

// The ! {Effects} syntax reads as "may perform these effects"
```

### The `!` Operator

The `!` symbol is the effect declaration operator. It reads as "bang" colloquially, or "effects" formally. It appears in two positions:

1. **In signatures**: declares what effects a function may perform
2. **At call sites**: propagates effects upward (like `?` for errors in Rust, but for effects)

```lux
fn save_user(user: User) -> Result<UserId, DbError> ! {Db} {
    db.insert("users", user) ! {Db}
}

// Calling a {Db} function from a pure context is a compile error:
fn process(user: User) -> UserId {
    save_user(user)  // ERROR: effect {Db} not declared in signature
}
```

### Built-in Effect Categories

Lux ships with a small, fixed set of effect categories. These are not extensible by user code (this is a deliberate constraint, not a limitation).

| Effect | What it covers |
|--------|---------------|
| `Net` | Any network I/O: HTTP, TCP, UDP, DNS, sockets |
| `Fs` | Filesystem reads and writes |
| `Db` | Database queries and mutations |
| `Env` | Reading environment variables, system properties |
| `Time` | Reading the clock, sleeping, timeouts |
| `Rand` | Random number generation |
| `Proc` | Spawning processes, threads, async tasks |
| `Mut` | Mutating shared state (interior mutability) |
| `Unsafe` | Raw pointer operations, FFI calls |

**Why fixed, not extensible?** Because the effect set is a security manifest. If users can define arbitrary effects, the manifest becomes meaningless (every library defines its own, nobody agrees on granularity). A fixed set means every Lux program's effects are comparable, auditable, and toolable. An AI agent can be told "generate code with no Net or Fs effects" and the compiler enforces it.

### Effect Polymorphism

Functions can be generic over effects. This is essential for higher-order functions:

```lux
// map is pure if the function passed to it is pure.
// map has whatever effects f has.
fn map<T, U, E>(list: List<T>, f: fn(T) -> U ! E) -> List<U> ! E {
    // ...
}

// Using map with a pure function: result is pure
let doubled = map(numbers, |n| n * 2)

// Using map with an effectful function: result carries the effect
let fetched = map(ids, |id| fetch_user(id) ! {Net, Db}) ! {Net, Db}
```

### Effect Boundaries

A `boundary` block creates an effect boundary: code inside can perform effects, but the boundary itself is pure from the outside. This is how you build pure interfaces over effectful implementations (caching, memoization, lazy initialization).

```lux
// The function is pure from the caller's perspective.
// The Mut effect is contained within the boundary.
fn fibonacci(n: u64) -> u64 {
    boundary {Mut} {
        let cache = MutMap::new()
        fn fib_inner(n: u64) -> u64 ! {Mut} {
            match cache.get(n) {
                Some(v) => v,
                None => {
                    let result = if n <= 1 { n } else { fib_inner(n-1) + fib_inner(n-2) }
                    cache.set(n, result) ! {Mut}
                    result
                }
            }
        }
        fib_inner(n) ! {Mut}
    }
}
```

Boundaries are auditable. The compiler verifies that the contained effects don't leak. A `boundary {Mut}` that secretly performs `Net` is a compile error.

### Effect Capabilities (The Permission Model)

This is where Lux diverges from academic effect systems and becomes practical for AI-native development.

Every effect requires a *capability token* to perform. Capability tokens are created at the program entry point and passed explicitly through the call chain. You cannot conjure a capability from nothing.

```lux
// main receives all capabilities from the runtime
fn main(cap: Capabilities) -> Result<(), Error> ! {Net, Fs, Env} {
    let config = load_config(cap.env) ! {Env}
    let users = fetch_users(cap.net, config.api_url) ! {Net}
    write_report(cap.fs, users, config.output_path) ! {Fs}
}

// This function can only touch the network. It cannot read files,
// even if it wanted to, because it doesn't have the Fs capability.
fn fetch_users(net: Cap<Net>, url: Url) -> List<User> ! {Net} {
    let response = http.get(net, url) ! {Net}
    parse_users(response.body)
}
```

**Why capabilities matter for AI:**
- An AI agent generating a library function never has access to capabilities directly. It must receive them from the caller.
- A code reviewer can verify the security surface by reading the capability parameters, not the implementation.
- A sandbox can restrict capabilities at the entry point: `main` in a sandboxed context might receive `Cap<Net>` with an allowlist of domains.
- Capability tokens are unforgeable. There is no `Cap::new()` in user code.

## Syntax Overview

### Functions

```lux
// Pure function
fn greet(name: String) -> String {
    "Hello, {name}"
}

// Effectful function
fn read_config(fs: Cap<Fs>, path: Path) -> Config ! {Fs} {
    let contents = fs.read(path) ! {Fs}
    parse_toml(contents)
}
```

### Pipelines

```lux
fn handle_request(cap: Capabilities, req: Request) -> Response ! {Net, Db} {
    req
        |> authenticate(cap.net) ! {Net}
        |> parse_body
        |> validate
        |> persist(cap.db) ! {Db}
        |> to_response
}
```

### Pattern Matching

```lux
fn describe(status: Status) -> String {
    match status {
        Status::Running(since) => "Running since {since}",
        Status::Stopped(reason) => "Stopped: {reason}",
        Status::Unknown => "Unknown status",
    }
}
```

### Structs and Enums

```lux
struct User {
    id: UserId,
    name: String,
    email: Email,
}

enum Status {
    Running(Timestamp),
    Stopped(String),
    Unknown,
}
```

### Error Handling

Lux uses Result types (like Rust) but with effect-aware propagation:

```lux
fn load_user(net: Cap<Net>, db: Cap<Db>, id: UserId) -> Result<User, AppError> ! {Net, Db} {
    let cached = cache.get(id)?          // ? propagates errors
    if let Some(user) = cached {
        return Ok(user)
    }
    let user = fetch_user(net, id) ! {Net} ?  // ! propagates effects, ? propagates errors
    db.cache(id, &user) ! {Db} ?
    Ok(user)
}
```

### Modules

```lux
// One file = one module. No choice.
// Public items are explicitly marked.
// Everything else is private.

pub fn create_user(db: Cap<Db>, name: String) -> Result<User, DbError> ! {Db} {
    let id = generate_id()
    let user = User { id, name, email: Email::empty() }
    db.insert("users", &user) ! {Db} ?
    Ok(user)
}

// Private helper. Not visible outside this module.
fn generate_id() -> UserId {
    // Pure computation, no effects needed
    UserId::from_hash(timestamp_seed())
}
```

## Memory Model

Lux uses ownership and borrowing (the Rust model) for memory safety. This is not the novel contribution and is deliberately not reinvented. The key differences from Rust:

1. **No `unsafe` keyword.** The equivalent is the `Unsafe` effect, which is tracked like any other effect. `Unsafe` code is visible in signatures, auditable, and restrictable via capabilities.

2. **No raw pointers in safe code.** Pointer arithmetic requires `Cap<Unsafe>`, which is not available in normal programs. FFI boundaries are the only place this appears.

3. **Simpler lifetime annotations.** Lux uses region-based memory management with fewer explicit lifetime parameters than Rust. The compiler infers more aggressively. This trades some expressiveness for readability (the AI-native tradeoff: simpler code that's easier to generate correctly).

## Compilation and Tooling

- **`lux build`**: Compile to native code (LLVM backend, like Rust)
- **`lux check`**: Type-check and effect-check without compiling
- **`lux audit`**: Print the effect manifest for a program (every function, its effects, its capabilities)
- **`lux fmt`**: Format code (one canonical style, like `gofmt`, not configurable)
- **`lux test`**: Run tests (tests are pure by default, effectful tests require explicit capability injection)
- **`lux sandbox`**: Run a program with restricted capabilities (e.g., no network, filesystem limited to one directory)

### The Audit Tool

`lux audit` is the killer feature for AI-native development. It produces a complete manifest:

```
$ lux audit src/main.lux

main                    ! {Net, Fs, Env}
  load_config           ! {Env}
  fetch_users           ! {Net}
    http.get            ! {Net}
    parse_users         (pure)
  write_report          ! {Fs}
    format_report       (pure)
    fs.write            ! {Fs}
```

An AI agent's output can be audited before execution. A CI pipeline can reject PRs that introduce unexpected effects. A security team can set policy: "this service may not use `Proc` or `Unsafe`."

## Open Questions

1. **Async model.** Is async an effect (`Proc`) or a language primitive? Rust's async is powerful but complex. Go's goroutines are simple but hide concurrency. Where does Lux land?

2. **Standard library scope.** Minimal (like Rust) or batteries-included (like Go)? The effect system makes batteries-included safer (every stdlib function declares its effects), but a large stdlib is a large maintenance burden.

3. **Interop story.** C FFI is essential for adoption. How does the effect system interact with foreign code? (Likely: all FFI calls are `! {Unsafe}` by default, with manual effect annotations for well-known libraries.)

4. **Effect inference.** Should the compiler infer effects for private functions? (Probably yes for ergonomics, but explicit annotations on public functions are mandatory.)

5. **Generics model.** Rust-style monomorphization or Go-style boxing? Monomorphization is faster but produces larger binaries and slower compiles. The AI-native tradeoff might favor faster compiles.

6. **REPL and incremental compilation.** AI agents benefit from fast feedback loops. A REPL with effect tracking would be valuable but is hard to build for a compiled language.

## Influences

- **Rust**: Ownership, borrowing, Result types, pattern matching, no null
- **Go**: Structural simplicity, one way to do things, fast compilation, gofmt
- **HCL**: The belief that a language should have an opinion about program structure
- **Haskell**: Effect tracking (IO monad), purity as default
- **Unix**: Pipelines as composition, text as interface, small composable tools
- **Koka**: Academic effect system research (algebraic effects, effect polymorphism)
- **Zig**: Explicit allocation, no hidden control flow, comptime
- **Austral**: Linear types with a capability-based security model

## Non-Goals

- **Backward compatibility with C/C++.** Lux is not a C replacement. It's a new language for new code. FFI exists for interop, not for migration.
- **Maximum expressiveness.** Lux deliberately constrains what you can express. The constraint is the feature.
- **Academic purity.** The effect system is practical, not theoretically complete. It covers the effects that matter for real programs, not every possible effect.
- **Gradual adoption.** Lux is not designed to be sprinkled into existing codebases. It's designed for new projects that want the full safety guarantee from day one.
