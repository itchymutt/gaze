// AST fields are intentionally broad for future demos.
#![allow(dead_code)]

mod ast;
mod effects;
mod error;
mod interpreter;
mod lexer;
mod parser;
mod token;

use std::process;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("usage: gaze <file.gaze>");
        process::exit(1);
    }

    let path = &args[1];
    let source = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: could not read {path}: {e}");
            process::exit(1);
        }
    };

    if let Err(msg) = run(&source, path) {
        eprintln!("{msg}");
        process::exit(1);
    }
}

/// Lex + parse + effect check. Returns the AST or an error message.
/// This is the `gaze check` pipeline.
fn check(source: &str, path: &str) -> Result<ast::Module, String> {
    let tokens = lexer::Lexer::new(source)
        .tokenize()
        .map_err(|e| error::format_error(source, path, e.offset as u32, &e.message))?;

    let module = parser::Parser::new(tokens)
        .parse_module()
        .map_err(|e| error::format_error(source, path, e.offset, &e.message))?;

    let effect_errors = effects::check_module(&module);
    if !effect_errors.is_empty() {
        let msgs: Vec<String> = effect_errors
            .iter()
            .map(|e| {
                error::format_effect_error(
                    source,
                    path,
                    e.offset,
                    &e.function_name,
                    &e.caused_by,
                    &e.missing_effect,
                )
            })
            .collect();
        return Err(msgs.join("\n\n"));
    }

    Ok(module)
}

/// Lex + parse + effect check + interpret.
fn run(source: &str, path: &str) -> Result<(), String> {
    let module = check(source, path)?;
    interpreter::execute(&module)
        .map_err(|e| error::format_error(source, path, e.offset, &e.message))?;
    Ok(())
}

// ============================================================
// Integration tests: parse and run source strings end to end.
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Run a program, return Ok(()) or the error message.
    fn run_ok(source: &str) {
        if let Err(msg) = run(source, "<test>") {
            panic!("program failed:\n{msg}\n\nsource:\n{source}");
        }
    }

    /// Check that a program fails effect checking.
    fn check_fails(source: &str, expected_substring: &str) {
        match check(source, "<test>") {
            Ok(_) => panic!("expected effect error containing '{expected_substring}', but check passed\n\nsource:\n{source}"),
            Err(msg) => {
                assert!(
                    msg.contains(expected_substring),
                    "error message didn't contain '{expected_substring}':\n{msg}\n\nsource:\n{source}"
                );
            }
        }
    }

    /// Run a program, expect a runtime error containing the substring.
    fn run_fails(source: &str, expected_substring: &str) {
        match run(source, "<test>") {
            Ok(()) => panic!("expected runtime error containing '{expected_substring}', but program succeeded\n\nsource:\n{source}"),
            Err(msg) => {
                assert!(
                    msg.contains(expected_substring),
                    "error message didn't contain '{expected_substring}':\n{msg}\n\nsource:\n{source}"
                );
            }
        }
    }

    // --- Hello world ---

    #[test]
    fn hello_world() {
        run_ok(r#"fn main() can Console { print("Hello, world.") }"#);
    }

    // --- Effect checking ---

    #[test]
    fn print_without_console_is_rejected() {
        check_fails(
            r#"fn main() { print("sneaky") }"#,
            "requires `can Console`",
        );
    }

    #[test]
    fn print_with_console_is_allowed() {
        run_ok(r#"fn main() can Console { print("ok") }"#);
    }

    #[test]
    fn pure_function_calling_print_is_rejected() {
        check_fails(
            r#"
            fn helper() { print("bad") }
            fn main() can Console { helper() }
            "#,
            "requires `can Console`",
        );
    }

    #[test]
    fn multiple_effects_declared() {
        run_ok(r#"fn main() can Console, Fail { print("ok") }"#);
    }

    // --- Let bindings and variables ---

    #[test]
    fn let_binding_and_variable_lookup() {
        run_ok(r#"fn main() can Console { let x = 42  print(x) }"#);
    }

    #[test]
    fn undefined_variable_is_error() {
        run_fails(
            r#"fn main() can Console { print(x) }"#,
            "undefined variable `x`",
        );
    }

    // --- Arithmetic ---

    #[test]
    fn addition() {
        run_ok(r#"fn main() can Console { print(2 + 3) }"#);
    }

    #[test]
    fn operator_precedence() {
        // 2 + 3 * 4 = 14, not 20
        run_ok(r#"fn main() can Console { print(2 + 3 * 4) }"#);
    }

    #[test]
    fn parenthesized_expression() {
        // (2 + 3) * 4 = 20
        run_ok(r#"fn main() can Console { print((2 + 3) * 4) }"#);
    }

    #[test]
    fn division_by_zero() {
        run_fails(
            r#"fn main() can Console { print(1 / 0) }"#,
            "division by zero",
        );
    }

    #[test]
    fn comparison_operators() {
        run_ok(r#"fn main() can Console { print(3 > 2) }"#);
    }

    #[test]
    fn string_concatenation() {
        run_ok(r#"fn main() can Console { print("hello" + " world") }"#);
    }

    #[test]
    fn type_mismatch_in_binop() {
        run_fails(
            r#"fn main() can Console { print(1 + "two") }"#,
            "type mismatch",
        );
    }

    // --- User-defined functions ---

    #[test]
    fn user_function_with_params() {
        run_ok(r#"
            fn add(a: Int, b: Int) -> Int { a + b }
            fn main() can Console { print(add(2, 3)) }
        "#);
    }

    #[test]
    fn function_return_value() {
        run_ok(r#"
            fn double(x: Int) -> Int { x * 2 }
            fn main() can Console {
                let y = double(5)
                print(y)
            }
        "#);
    }

    #[test]
    fn undefined_function_is_error() {
        run_fails(
            r#"fn main() can Console { nope() }"#,
            "undefined function `nope`",
        );
    }

    // --- Structs ---

    #[test]
    fn struct_construction_and_field_access() {
        run_ok(r#"
            struct Point { x: Int, y: Int }
            fn main() can Console {
                let p = Point { x: 3, y: 4 }
                print(p.x)
            }
        "#);
    }

    #[test]
    fn struct_passed_to_function() {
        run_ok(r#"
            struct Point { x: Int, y: Int }
            fn sum(p: Point) -> Int { p.x + p.y }
            fn main() can Console {
                let p = Point { x: 3, y: 4 }
                print(sum(p))
            }
        "#);
    }

    #[test]
    fn struct_field_not_found() {
        run_fails(
            r#"
            struct Point { x: Int, y: Int }
            fn main() can Console {
                let p = Point { x: 3, y: 4 }
                print(p.z)
            }
            "#,
            "has no field `z`",
        );
    }

    #[test]
    fn field_access_on_non_struct() {
        run_fails(
            r#"fn main() can Console { let x = 5  print(x.y) }"#,
            "cannot access field",
        );
    }

    #[test]
    fn struct_prints_nicely() {
        run_ok(r#"
            struct Point { x: Int, y: Int }
            fn main() can Console {
                let p = Point { x: 3, y: 4 }
                print(p)
            }
        "#);
    }

    // --- Enums and match ---

    #[test]
    fn enum_variant_construction_and_match() {
        run_ok(r#"
            enum Shape { Circle(Int), Rect(Int, Int) }
            fn area(s: Shape) -> Int {
                match s {
                    Circle(r) => r * r,
                    Rect(w, h) => w * h,
                }
            }
            fn main() can Console {
                print(area(Circle(5)))
                print(area(Rect(3, 4)))
            }
        "#);
    }

    #[test]
    fn zero_arity_enum_variant() {
        run_ok(r#"
            enum Color { Red, Blue }
            fn name(c: Color) -> String {
                match c {
                    Red => "red",
                    Blue => "blue",
                }
            }
            fn main() can Console { print(name(Red)) }
        "#);
    }

    #[test]
    fn match_with_wildcard() {
        run_ok(r#"
            enum Dir { Up, Down, Left, Right }
            fn is_vertical(d: Dir) -> String {
                match d {
                    Up => "yes",
                    Down => "yes",
                    _ => "no",
                }
            }
            fn main() can Console { print(is_vertical(Left)) }
        "#);
    }

    #[test]
    fn match_with_int_literal_pattern() {
        run_ok(r#"
            fn describe(n: Int) -> String {
                match n {
                    0 => "zero",
                    1 => "one",
                    _ => "other",
                }
            }
            fn main() can Console { print(describe(1)) }
        "#);
    }

    #[test]
    fn non_exhaustive_match_is_error() {
        run_fails(
            r#"
            enum Color { Red, Blue }
            fn main() can Console {
                let x = match Red {
                    Blue => "blue",
                }
                print(x)
            }
            "#,
            "no match arm matched",
        );
    }

    // --- Pipelines ---

    #[test]
    fn simple_pipeline() {
        run_ok(r#"
            fn double(x: Int) -> Int { x * 2 }
            fn main() can Console {
                let r = 5 |> double
                print(r)
            }
        "#);
    }

    #[test]
    fn chained_pipeline() {
        run_ok(r#"
            fn double(x: Int) -> Int { x * 2 }
            fn add_one(x: Int) -> Int { x + 1 }
            fn main() can Console {
                let r = 5 |> double |> add_one |> double
                print(r)
            }
        "#);
    }

    #[test]
    fn pipeline_with_extra_args() {
        run_ok(r#"
            fn add(a: Int, b: Int) -> Int { a + b }
            fn main() can Console {
                let r = 5 |> add(10)
                print(r)
            }
        "#);
    }

    // --- Combined features ---

    #[test]
    fn invoice_example() {
        run_ok(r#"
            struct Item { name: String, price: Int, qty: Int }
            enum Discount { Percent(Int), Fixed(Int), None }

            fn line_total(item: Item) -> Int {
                item.price * item.qty
            }

            fn apply_discount(subtotal: Int, d: Discount) -> Int {
                match d {
                    Percent(pct) => subtotal - subtotal * pct / 100,
                    Fixed(amount) => subtotal - amount,
                    None => subtotal,
                }
            }

            fn main() can Console {
                let a = Item { name: "Widget", price: 10, qty: 3 }
                let b = Item { name: "Gadget", price: 5, qty: 2 }
                let subtotal = line_total(a) + line_total(b)
                let total = subtotal |> apply_discount(Percent(10))
                print(total)
            }
        "#);
    }

    #[test]
    fn effect_check_through_match_arms() {
        check_fails(
            r#"
            enum Action { Log, Noop }
            fn handle(a: Action) {
                match a {
                    Log => print("logged"),
                    Noop => 0,
                }
            }
            fn main() can Console { handle(Log) }
            "#,
            "requires `can Console`",
        );
    }

    #[test]
    fn effect_check_through_struct_field_init() {
        check_fails(
            r#"
            struct Wrapper { val: Int }
            fn make() -> Wrapper {
                Wrapper { val: print("side effect") }
            }
            fn main() can Console { make() }
            "#,
            "requires `can Console`",
        );
    }
}
