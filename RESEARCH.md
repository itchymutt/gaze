# Language Comparison for Lux Design

A research document covering Julia, and six novel languages with effect systems or safety innovations. Focus: design decisions, tradeoffs, and what Lux can steal.

---

## 1. Julia

### Type System

Julia's type system is **dynamic, nominative, and parametric**. It sits in a unique position: dynamically typed like Python, but with a rich type hierarchy that the JIT compiler exploits for performance.

**Type hierarchy.** Every value belongs to a single, fully connected type graph rooted at `Any` (top) with `Union{}` (bottom). Abstract types cannot be instantiated and exist solely as nodes in the hierarchy. Concrete types are **final**: they cannot be subtyped. This is a deliberate restriction. You inherit behavior (via multiple dispatch), not structure. `Number <: Real <: AbstractFloat <: Float64` forms a chain, but `Float64` cannot have subtypes.

**Parametric types.** Types can be parameterized: `Point{T}` declares a family of types. Type parameters are **invariant**: `Point{Float64}` is NOT a subtype of `Point{Real}`, even though `Float64 <: Real`. This is a performance decision. `Array{Float64}` stores contiguous 64-bit values. `Array{Real}` stores boxed pointers. Covariance would require uniform representation, destroying the performance advantage.

**Union types.** `Union{Int, String}` is a first-class type. Small unions are compiled efficiently via tagged-union optimizations. `Union{T, Nothing}` is Julia's `Option`/`Maybe` equivalent.

**Multiple dispatch.** The central organizing principle. Functions are generic, methods are specializations. `+(x::Float64, y::Float64)` and `+(x::Int, y::Int)` are methods of the same function `+`. Dispatch considers ALL argument types, not just the receiver. The `+` operator alone has 180+ methods. This is more expressive than single-dispatch OOP: `interact(a::Wizard, b::Dragon)` dispatches on both types, something that requires the Visitor pattern in Java.

**Expressiveness.** The combination of parametric types, abstract type hierarchy, and multiple dispatch is remarkably expressive. "Holy traits" simulate Haskell-style type classes. Generated functions (`@generated`) can produce specialized method bodies based on input types at compile time. The cost: method ambiguity is a real problem. Two methods `f(x::A, y)` and `f(x, y::B)` are ambiguous for `f(a::A, b::B)`. Julia raises a `MethodError` rather than picking arbitrarily.

**Design lesson for Lux:** Multiple dispatch is genuinely powerful for mathematical and scientific code. The invariance of type parameters is a pragmatic, performance-driven decision. But the lack of interfaces/traits as first-class concepts means API contracts are implicit, enforced by convention rather than the compiler.

### Side Effects and Purity

Julia does **not track side effects**. There is no effect system, no purity annotation enforced by the compiler, and no I/O monad.

Functions can be annotated `@pure` (via `Base.@assume_effects :total`), but this is a **promise from the programmer to the compiler**, not a checked property. The compiler trusts you. If you lie, you get wrong results.

I/O is handled with plain function calls: `println()`, `open()`, `read()`. No monadic wrapping, no capability passing. Any function can perform any effect at any time. The language is maximally permissive here.

**`@assume_effects` annotations** (Julia 1.8+) let programmers declare that a function is `:consistent` (same inputs produce same outputs), `:effect_free` (no side effects), `:terminates_globally`, or `:total` (all of the above). The compiler uses these for optimization (constant folding, dead code elimination). But again, these are unchecked assertions.

**Design lesson for Lux:** Julia chose maximum convenience at the cost of any effect tracking. This makes it easy to write code but impossible to reason mechanically about what a function does. An effect system would be the single biggest divergence Lux could make from Julia's philosophy.

### Memory Model

**Garbage collected.** Julia uses a non-moving, generational, parallel, and partially concurrent GC. Small objects (<=2032 bytes) use a fast per-thread pool allocator; large objects go through `malloc`.

**No ownership model.** There is no borrow checker, no linear types, no move semantics. Values are either:
- **Immutable structs**: stack-allocated or inlined. `struct Point; x::Float64; y::Float64; end` can be stored as 16 contiguous bytes. These are the fast path.
- **Mutable structs**: heap-allocated, managed by GC. `mutable struct Foo; ... end` is always a pointer.

**Memory safety.** Julia is memory-safe in pure Julia code. You cannot have dangling pointers, use-after-free, or buffer overflows within the language. However:
- `ccall` (the C FFI) is unsafe. You can call `malloc`/`free`, cast pointers arbitrarily, and corrupt memory.
- `Ptr{T}` and `unsafe_load`/`unsafe_store!` exist for C interop. These bypass all safety checks.
- `@inbounds` disables bounds checking, enabling buffer overruns.

**Design lesson for Lux:** Julia's GC approach is simple and works well for its target audience (scientists, data analysts). The immutable-by-default struct design is strong: it enables stack allocation and eliminates a class of aliasing bugs. But the lack of any ownership discipline means GC pauses are unavoidable, and low-latency/embedded targets are difficult.

### Metaprogramming and Macros

Julia has **Lisp-style homoiconic metaprogramming**. Code is represented as `Expr` objects (AST nodes) that can be constructed, manipulated, and evaluated programmatically.

**Quoting and interpolation.** `:(a + b)` creates an `Expr`. `$x` interpolates a value into a quoted expression. This is exactly Lisp's quote/unquote.

**Macros.** `@macro_name(args...)` transforms AST at parse time. Macros receive expressions (not values) and return expressions. Julia implements **hygienic macros**: local variables in macro expansions are renamed to avoid capture. `esc()` explicitly breaks hygiene when needed.

**Generated functions.** `@generated` functions produce specialized method bodies based on the *types* (not values) of their arguments. They run at compile time and return a quoted expression that becomes the method body. This is a controlled form of type-level metaprogramming.

**Design lesson for Lux:** Julia's metaprogramming is powerful but carries the usual risks: macros make code harder to understand, harder to debug, and harder to tool. The `@generated` function concept is interesting: it occupies a middle ground between full macro power and simple generics. Consider whether Lux needs full AST macros or whether staged computation and type-level programming are sufficient.

### Performance Model

Julia uses **JIT compilation** via LLVM. When a function is first called with specific argument types, Julia:
1. Infers types through the call graph
2. Generates specialized LLVM IR for those concrete types
3. Compiles to native machine code
4. Caches the result

**How close to C?** For type-stable, non-allocating code, Julia generates the same LLVM IR as equivalent C. Numerical loops, linear algebra, and array operations routinely match C/Fortran speed. The benchmarks on julialang.org show within 2x of C for most micro-benchmarks.

**Where it falls apart:**
- **Type instability**: if the compiler can't infer concrete types, it generates boxed, dynamically-dispatched code. Performance drops 10-100x.
- **First-call latency (TTFX)**: JIT compilation adds seconds of latency on first use. `using Plots; plot(rand(10))` took 10+ seconds in early Julia versions. Precompilation and `PackageCompiler.jl` mitigate this.
- **GC pauses**: for real-time or latency-sensitive work, GC pauses are a real constraint.
- **Global variables**: untyped globals defeat type inference. The compiler can't know their type will remain stable.

**`@inbounds`** eliminates array bounds checks. **`@simd`** enables SIMD vectorization. **`@fastmath`** allows reordering of floating-point operations. These are opt-in performance annotations, not safety annotations.

**Design lesson for Lux:** Julia proves that a high-level dynamic language can achieve C-like speed via specialization. The cost is complexity in understanding what the compiler will and won't optimize. A statically-typed language with similar specialization could avoid the type-stability pitfall entirely.

### Weaknesses

1. **No safety guarantees beyond memory safety.** No data race prevention, no effect tracking, no ownership discipline. Any function can mutate anything reachable through its arguments.

2. **Type instability is invisible.** Writing code that's 100x slower than it should be is trivially easy. `@code_warntype` helps, but it's a diagnostic tool, not a preventive measure.

3. **First-call latency.** Despite improvements, TTFX remains a real problem for CLI tools, short-running scripts, and interactive workflows.

4. **The "two-language problem" shifts, doesn't disappear.** Julia replaces C/Python with Julia/Julia-that-the-compiler-likes. You still need to understand the compiler's optimization model.

5. **Package loading overhead.** Large dependency trees take substantial time to load and precompile.

6. **No static compilation story (fully).** `PackageCompiler.jl` exists but produces large binaries and doesn't eliminate all JIT overhead.

7. **Concurrency model is limited.** Julia has tasks (green threads) and multi-threading, but no compile-time data race prevention. `@threads for` is convenient but doesn't prevent shared-state bugs.

8. **C FFI is unsafe with no guardrails.** `ccall` and `Ptr{T}` are necessary but have zero safety checking.

### Julia vs Rust: Safety Comparison

| Dimension | Julia | Rust |
|-----------|-------|------|
| Memory safety | GC prevents leaks/use-after-free in pure code. `ccall`/`Ptr` are unsafe escape hatches | Ownership + borrowing prevents leaks/use-after-free at compile time. `unsafe` blocks for escape |
| Data race prevention | None. `@threads` can race on shared data with no warning | Ownership prevents data races at compile time. `Send`/`Sync` traits encode thread-safety |
| Null safety | `nothing` is a regular value. `Union{T, Nothing}` for optional, but not enforced | `Option<T>` is the only way to represent absence. Pattern matching enforced |
| Effect tracking | None | No formal effect system, but ownership/lifetime system constrains what functions can do |
| Type safety | Dynamic. Runtime type errors via `MethodError` | Static. Compile-time type errors |
| Performance predictability | Depends on type stability. Can silently be 100x slow | Predictable. What you write is what runs |
| Ease of use | Very easy to write. Hard to write fast code consistently | Hard to learn. Once past the borrow checker, code is reliably correct and fast |
| Metaprogramming | Full AST macros, `@generated` functions | Declarative macros (`macro_rules!`) and procedural macros. Less powerful but safer |

**The fundamental tradeoff:** Julia optimizes for **time to first working prototype**. Rust optimizes for **time to correct, production-quality code**. Julia gives you speed when you understand the compiler. Rust gives you safety when you satisfy the type system.

---

## 2. Koka (Microsoft Research)

### Novel Contribution
**Algebraic effect handlers as a first-class language feature, with Perceus reference counting.**

Koka is the most mature language built around algebraic effects. Every function's type signature declares which effects it may perform. `fun greet(): console ()` says "this function uses the console effect and returns unit." Effect types propagate automatically through the call graph.

### Effect/Safety Story

**Effect rows.** Every function type in Koka includes an effect row: `(a) -> e b` means "takes `a`, may perform effects `e`, returns `b`". Effects are polymorphic: a `map` function is `(a -> e b, list<a>) -> e list<b>`, correctly propagating whatever effects the mapping function has.

**Handlers.** Effects are defined as operations; handlers provide implementations. The `state` effect might declare `get` and `set` operations. A handler intercepts these operations and can:
- Resume the computation with a value (like answering `get` with the current state)
- Resume multiple times (for nondeterminism)
- Not resume at all (for exceptions)
- Transform the continuation (for async/await)

This unifies exceptions, state, I/O, nondeterminism, async, coroutines, and generators under one mechanism.

**Perceus reference counting.** Koka uses precise, compiler-inserted reference counting with a novel optimization called "Perceus" (Precise Reference Counting with Reuse). It detects when a data structure is uniquely owned and reuses its memory in-place, achieving functional-programming-style code with imperative-style memory performance. No GC pauses. Deterministic destruction.

### What Lux Can Learn

1. **Effect rows are the right granularity for effect tracking.** Not monads (too verbose, composition is painful), not no tracking (Julia). Row-polymorphic effects let generic functions transparently propagate effects.

2. **Handlers are more general than monads.** They can implement exceptions, state, async, nondeterminism, and custom domain effects. The handler decides the semantics, not the effect definition.

3. **Perceus proves reference counting can compete with tracing GC** when the compiler has enough information. The reuse optimization is particularly clever: `map(f, Cons(x, xs))` can reuse the `Cons` cell in-place when the list has a single reference.

4. **Tradeoff: performance of effect handlers is still an open research problem.** Deep handlers (that capture continuations) are expensive. Koka optimizes tail-resumptive handlers (the common case) to be cheap, but general handlers involve allocation of continuation frames.

---

## 3. Unison

### Novel Contribution
**Content-addressed code + abilities (algebraic effects) + distributed computing as a first-class concept.**

Unison stores code as a hash-identified AST, not as text files. Functions are identified by the hash of their syntax tree, not their name. This eliminates dependency conflicts, enables seamless code distribution, and means "published" code is immutable.

### Effect/Safety Story

**Abilities** are Unison's effect system. A function type like `Nat -> {IO, State Nat} Nat` declares that it uses `IO` and `State Nat` abilities. Handlers provide implementations.

The system closely mirrors Koka's algebraic effects but with different syntax and a focus on practical use. Abilities are required in type signatures. Pure functions have empty ability sets.

The content-addressed code model provides a different kind of safety: there's no dependency hell, no version conflicts, no "it works on my machine." Code is identified by what it does, not what it's called.

### What Lux Can Learn

1. **The ability/handler pattern is a proven, practical effect system.** Both Koka and Unison have validated it.

2. **Content-addressed code is fascinating but radical.** It solves real problems (dependency management, code distribution) but requires rethinking the entire development workflow. For Lux: probably too radical for the core language, but the concept of hash-identified modules is worth exploring.

3. **Distributed computing as a language feature, not a library.** Unison's runtime can ship computations to remote nodes because code is identified by hash. The node just needs the hash to run the code. This is genuinely novel and worth studying if Lux has distributed computing ambitions.

---

## 4. Austral

### Novel Contribution
**Linear types + capability-based security in a deliberately simple language.**

Austral is the purest expression of linear types in a practical language. Its design goals are, in order: simplicity, correctness, security, readability, maintainability. The entire language spec fits in a single HTML page.

### Effect/Safety Story

**Two-universe type system.** Every type belongs to either the `Free` universe (can be used any number of times) or the `Linear` universe (must be used exactly once). A type containing a linear field is automatically linear (linearity is "viral").

**What linear types give you:**
- Manual memory management without leaks, use-after-free, or double-free. No GC, no runtime overhead.
- Resource lifecycle enforcement: file handles, database connections, network sockets all follow open-use-close with compiler verification.
- Safe concurrency: a linear value has exactly one owner, so no data races.
- In-place optimization: functional-looking APIs can mutate under the hood because the compiler knows there's a single owner.

**Borrowing.** Austral adds a `borrow` statement that creates a temporary reference to a linear value. During the borrow, the original binding is inaccessible. This is similar to Rust's borrows but simpler: borrows are lexically scoped and don't require lifetime annotations.

**Capability-based security.** Dangerous operations (I/O, FFI, etc.) require a linear capability token. The `Root` capability is created at program entry and must be passed to any function that does I/O. You can split capabilities (e.g., separate `FileSystem` and `Network` capabilities). This is compile-time enforcement of the principle of least privilege.

**No implicit function calls.** No destructors are implicitly inserted. If you have a linear value, you must explicitly consume it. This is the tradeoff vs Rust: more verbose, but no hidden control flow.

### What Lux Can Learn

1. **Linear types solve resource management without GC.** The two-universe model (free/linear) is simple to understand and implement. It's a credible alternative to Rust's borrow checker.

2. **Capability-based security is elegant.** Passing a `Terminal` capability to a function is cleaner than permission flags, and it's enforced at compile time. Lux should consider capability tokens for I/O and system resources.

3. **Simplicity is a feature.** Austral proves that a useful systems language can fit in a single person's head. The spec is intentionally small. Compare this to Rust, where the borrow checker, lifetime system, trait system, and async machinery create substantial learning surface.

4. **Tradeoff: verbosity.** Threading linear values through code is tedious. Every function that touches a resource must accept and return it. Austral mitigates this with borrowing, but it's still more explicit than Rust's implicit borrowing.

5. **Tradeoff: affine vs linear.** Austral chose linear (must use exactly once) over affine (use at most once, with implicit drop). This means no implicit destructors, which is simpler but requires explicit cleanup at every code path. Rust chose affine (with `Drop`).

---

## 5. Vale

### Novel Contribution
**Generational references + region-based memory management.**

Vale uses "generational references" as its primary safety mechanism. Every allocation gets a generation counter. When an object is freed, its generation is incremented. References carry the expected generation. Accessing a freed object detects the stale generation and panics (in debug) or is elided (in release, with regions).

### Effect/Safety Story

**Generational references (debug mode).** Every reference carries a generation number. On access, the runtime checks that the reference's generation matches the allocation's current generation. This catches use-after-free at runtime, similar to how bounds checking catches buffer overflows. Cost: one integer comparison per access.

**Regions (the optimization).** Vale's region system divides the heap into regions with different permissions. A function can declare that it views a region as read-only (`ro`), which allows the compiler to skip generation checks entirely for references into that region. The key insight: most code mostly reads. If you can prove a region is immutable for a scope, you eliminate safety overhead for that entire scope.

**Reference types:**
- Owning references (unique ownership)
- Constraint references (non-owning, generation-checked)
- Weak references (explicitly nullable, generation-checked)

**No borrow checker.** Vale deliberately avoids Rust-style lifetime annotations. The claim is that generational references provide similar safety with less programmer friction, at the cost of runtime checking in debug mode.

### What Lux Can Learn

1. **Generational references are a credible middle ground** between GC (zero programmer effort, runtime cost) and ownership (zero runtime cost, high programmer effort). The safety is not compile-time, but it's deterministic and catchable.

2. **The region system for optimization is clever.** "Prove this scope is read-only, skip all checks" is a powerful optimization strategy that doesn't require lifetime annotations.

3. **Tradeoff: runtime safety vs compile-time safety.** Generational references catch errors at runtime, not compile time. In release mode with regions, safety depends on the region annotations being correct. This is a weaker guarantee than Rust's compile-time proofs.

4. **Tradeoff: Vale is still experimental.** Many features (regions, bump calling) are planned but not implemented. The practical viability of the full design is unproven.

---

## 6. Eff

### Novel Contribution
**Research language that pioneered algebraic effect handlers as a programming construct.**

Eff is the original language designed to test algebraic effects in practice. Created by Andrej Bauer and Matija Pretnar, it demonstrated that algebraic effects could be a practical programming tool, not just a theoretical concept.

### Effect/Safety Story

Effects are first-class. You can define custom effects, write handlers that intercept them, resume continuations, and compose effects freely. No monad transformers needed.

**What Eff demonstrated:**
- Exceptions are just one instance of an algebraic effect
- State, I/O, nondeterminism, and concurrency can all be expressed as effects with handlers
- Effect handlers compose cleanly (unlike monad transformers)
- The handler-based model is intuitive for programmers who already understand try/catch

**The team explicitly discourages production use.** Eff is a research vehicle. It has no library ecosystem, minimal documentation, and changes frequently.

### What Lux Can Learn

1. **Eff validated the theory.** Koka and Unison built on Eff's foundations. The handler pattern works.

2. **The key insight from Eff**: handlers are *more general than monads* because they can intercept, transform, and resume computations. A handler for nondeterminism can choose to enumerate all paths, pick the first, or apply a strategy. This flexibility is impossible with monads alone.

3. **Performance remains the open question.** Eff didn't solve the performance problem of capturing and resuming continuations. Koka's Perceus and tail-resumptive optimizations are attempts to solve what Eff surfaced.

---

## 7. Hylo (formerly Val)

### Novel Contribution
**Mutable value semantics as a foundation for safe systems programming.**

Hylo's thesis: if ALL types have value semantics (they behave like integers: independent, copyable, no aliasing), then you don't need a borrow checker, lifetime annotations, or reference semantics at all. Memory safety falls out naturally.

### Effect/Safety Story

**Mutable value semantics (MVS).** In Hylo, every binding owns its value independently. Assignment copies. There are no references in the traditional sense. When you pass a value to a function, you specify:
- `let`: read-only access (callee gets a copy or a projection)
- `inout`: mutable access (callee gets exclusive, projected access)
- `sink`: ownership transfer (callee consumes the value)
- `set`: initialization of an uninitialized binding

**Subscripts, not references.** Hylo replaces references/pointers with "subscripts" that project values without copying. `longer_of(&x, &y)` doesn't return a reference; it yields a *projection* of either x or y. The caller gets temporary exclusive access. When the subscript scope ends, the projection ends.

This is subtly but importantly different from Rust:
- No lifetime annotations. The projection scope is always lexical.
- No references that can be stored. Projections exist only within the subscript scope.
- No aliasing is possible. The compiler enforces exclusivity.

**Method bundles.** A single `subscript` declaration can provide both `let` (read-only) and `inout` (read-write) access. The compiler selects the appropriate one based on context.

**Memory safety.** MVS provides:
- No use-after-free (values are owned, not referenced)
- No data races (no shared mutable state)
- No null pointers (no pointers at all in safe code)
- No dangling references (no references, only projections)

### What Lux Can Learn

1. **Value semantics eliminate entire categories of bugs by construction.** If there are no references, there are no reference bugs. Period. This is simpler than Rust's borrow checker because there's nothing to borrow.

2. **Subscripts/projections are a brilliant alternative to references.** They provide the same capability (mutating a part of a larger structure in-place) without the complexity of lifetime tracking.

3. **The `inout`/`let`/`sink`/`set` parameter passing conventions** are explicit about ownership transfer at every call site. This is more information than most languages provide.

4. **Tradeoff: can you build everything with value semantics?** Doubly-linked lists, graph structures, and shared caches are naturally reference-based. The Hylo team has a paper showing doubly-linked lists can work with MVS (and are actually faster), but the ergonomics of complex shared structures remain an open question.

5. **Tradeoff: no stored references means no observer pattern, no callbacks with context, no closures that capture mutable state.** These are common patterns that MVS must handle differently.

---

## Comparison Matrix

| Feature | Julia | Koka | Unison | Austral | Vale | Eff | Hylo |
|---------|-------|------|--------|---------|------|-----|------|
| Type system | Dynamic + parametric | Static + HM inference | Static + structural | Static + linear | Static + regions | Dynamic | Static + MVS |
| Effect tracking | None | Full (row-polymorphic) | Full (abilities) | Capability tokens | None | Full (pioneered it) | None (safety via MVS) |
| Memory management | Tracing GC | Perceus RC | Runtime-managed | Manual (linear types) | Generational refs | GC | Value semantics + RC |
| Memory safety | Safe (except FFI) | Safe | Safe | Safe (linear types) | Runtime-checked | Safe | Safe (no refs) |
| Data race safety | None | Effect-based | Ability-based | Linear ownership | Region-based | N/A | MVS (no sharing) |
| Performance model | JIT (LLVM) | AOT (C/LLVM backend) | Interpreter + AOT | AOT | AOT (LLVM) | Interpreter | AOT (LLVM) |
| Metaprogramming | Full AST macros | Limited | Content-addressed | None (by design) | Limited | None | Generics |
| Maturity | Production | Research/early | Growing ecosystem | Early | Alpha | Research only | Early |

---

## Synthesis: What Should Lux Take?

### From Julia
- **Multiple dispatch** is the most expressive function overloading mechanism available. Consider it as the primary dispatch mechanism, but combine it with compile-time type checking.
- **Parametric types with invariance** are the right default for performance. Covariance can be opt-in.
- **Type specialization** (compiling separate versions for concrete types) is the key to matching C performance from high-level code.

### From Koka
- **Row-polymorphic effect types** are the gold standard for effect tracking. Every function signature should declare its effects. Generic functions should be effect-polymorphic.
- **Perceus reference counting** proves that GC is not the only option for a high-level language. Precise RC with reuse optimization is competitive.

### From Austral
- **Linear types for resources** (files, sockets, locks). Not everything needs to be linear, but resources should be.
- **Capability-based I/O.** Require explicit capability tokens for side effects. This pairs naturally with an effect system: the "IO" effect requires an "IO" capability.
- **Simplicity as a design constraint.** If the feature can't fit in a programmer's head, it doesn't ship.

### From Hylo
- **Value semantics as the default.** Most types should behave like integers: no aliasing, no shared mutation. References are the exception, not the rule.
- **Subscripts/projections** as a replacement for mutable references. Lexically scoped, no lifetime annotations.
- **Parameter passing conventions** (`let`/`inout`/`sink`) make ownership explicit at every call site.

### From Vale
- **Regions as an optimization tool.** "This scope is read-only" is a powerful assertion that enables optimizations without requiring lifetime annotations.

### From Unison
- **Content-addressed modules** for dependency management. Even if the code isn't hash-identified, the module/package system could use content hashing for reproducible builds.

### What to Avoid
- Julia's lack of any effect tracking or compile-time safety. That's the core problem Lux should solve.
- Rust's lifetime annotation complexity. Hylo and Austral show there are simpler paths to safety.
- Koka's performance overhead for deep handlers. If Lux has algebraic effects, optimize for the common case (tail-resumptive handlers).
- Austral's extreme explicitness. Some implicit destruction (affine types with `Drop`) is worth the convenience.
- Eff's research-only status. Take the ideas, not the implementation approach.

### The Lux Hypothesis

A language that combines:
1. **Static types with multiple dispatch** (Julia's expressiveness, compile-time checking)
2. **Row-polymorphic effects** (Koka's tracked effects, Austral's capability tokens for I/O)
3. **Mutable value semantics** (Hylo's no-aliasing model, with subscripts for projections)
4. **Linear types for resources** (Austral's lifecycle enforcement, affine with optional `Drop`)
5. **Perceus-style reference counting** (Koka's deterministic memory management)

...would occupy a genuinely novel position: a high-performance systems language where the type system guarantees not just memory safety, but effect purity and resource lifecycle correctness, without requiring the programmer to satisfy a borrow checker.

The risk: combining all of these creates a complex type system. The constraint must be Austral's design goal #1: "fits in a single person's head."
