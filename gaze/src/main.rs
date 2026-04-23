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

fn run(source: &str, path: &str) -> Result<(), String> {
    // Lex
    let tokens = lexer::Lexer::new(source)
        .tokenize()
        .map_err(|e| error::format_error(source, path, e.offset as u32, &e.message))?;

    // Parse
    let module = parser::Parser::new(tokens)
        .parse_module()
        .map_err(|e| error::format_error(source, path, e.offset, &e.message))?;

    // Effect check
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

    // Interpret
    interpreter::execute(&module)
        .map_err(|e| error::format_error(source, path, e.offset, &e.message))?;

    Ok(())
}
