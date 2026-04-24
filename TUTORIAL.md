# Gaze in 2 minutes

## Install

```bash
git clone https://github.com/itchymutt/gaze.git
cd gaze
cargo install --path gaze
```

## Write a program

Create `hello.gaze`:

```gaze
fn main() can Console {
    print("Hello, world.")
}
```

Run it:

```bash
gaze run hello.gaze
```

## Add a pure function

```gaze
fn double(x: Int) -> Int {
    x * 2
}

fn main() can Console {
    let result = 5 |> double
    print(result)
}
```

`double` has no `can` clause — it's pure. It takes a value, returns a value, touches nothing. The `|>` operator pipes `5` into `double`.

## Break the rules

Remove `can Console` from main:

```gaze
fn main() {
    print("sneaky")
}
```

```bash
gaze check hello.gaze
```

```
error: `print` requires `can Console`
  --> hello.gaze:2:5
   |
2  |     print("sneaky")
   |     ^^^^^ this function performs Console effects
   |
   = help: add `can Console` to the function signature:
   |
   |  fn main() can Console {
```

The checker caught it. Effects can't be hidden.

## Effects propagate

```gaze
fn greet() can Console {
    print("hi")
}

fn main() {
    greet()
}
```

```
error: `greet` requires `can Console`
```

`main` calls `greet` which has `can Console`. So `main` must declare `can Console` too. Effects propagate through the call graph.

## See the effect map

```bash
gaze check examples/invoice.gaze
```

```
examples/invoice.gaze: ok
  Item  struct
  Discount  enum(Percent, Fixed, None)
  line_total  (pure)
  apply_discount  (pure)
  main  can Console
```

One line per function. You see the entire program's effect surface at a glance.

## Format your code

```bash
gaze fmt hello.gaze
```

One style. Not configurable. The file is rewritten in place.

## That's it

Four commands: `run`, `check`, `audit`, `fmt`. One keyword: `can`. Ten effects. The function signature tells you everything.
