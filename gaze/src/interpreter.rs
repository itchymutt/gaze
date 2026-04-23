use crate::ast::{Expr, Module, Stmt};

/// Runtime value.
#[derive(Debug, Clone)]
pub enum Value {
    String(String),
    Int(i64),
    Float(f64),
    Unit,
}

/// Interpreter error.
#[derive(Debug)]
pub struct RuntimeError {
    pub message: String,
    pub offset: u32,
}

impl std::fmt::Display for RuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "runtime error: {}", self.message)
    }
}

/// Execute a module by finding and running `fn main()`.
pub fn execute(module: &Module) -> Result<(), RuntimeError> {
    let main_fn = module
        .items
        .iter()
        .find_map(|item| match item {
            crate::ast::Item::Function(f) if f.name == "main" => Some(f),
            _ => None,
        })
        .ok_or_else(|| RuntimeError {
            message: "no `fn main()` found".into(),
            offset: 0,
        })?;

    for stmt in &main_fn.body {
        exec_stmt(stmt)?;
    }

    Ok(())
}

fn exec_stmt(stmt: &Stmt) -> Result<Value, RuntimeError> {
    match stmt {
        Stmt::Expr(expr) => eval_expr(expr),
        Stmt::Let(let_stmt) => {
            let _val = eval_expr(&let_stmt.value)?;
            // In Demo 1 we don't have variable lookup yet.
            // Let bindings are evaluated for their effects only.
            Ok(Value::Unit)
        }
    }
}

fn eval_expr(expr: &Expr) -> Result<Value, RuntimeError> {
    match expr {
        Expr::StringLit(s, _) => Ok(Value::String(s.clone())),
        Expr::IntLit(n, _) => Ok(Value::Int(*n)),
        Expr::FloatLit(n, _) => Ok(Value::Float(*n)),
        Expr::Ident(name, span) => Err(RuntimeError {
            message: format!("undefined variable `{name}`"),
            offset: span.start,
        }),
        Expr::Call { callee, args, span } => {
            // Evaluate callee to get function name
            let func_name = match callee.as_ref() {
                Expr::Ident(name, _) => name.as_str(),
                _ => {
                    return Err(RuntimeError {
                        message: "only named function calls are supported".into(),
                        offset: span.start,
                    });
                }
            };

            // Evaluate arguments
            let arg_values: Vec<Value> = args
                .iter()
                .map(eval_expr)
                .collect::<Result<Vec<_>, _>>()?;

            // Dispatch builtins
            match func_name {
                "print" => builtin_print(&arg_values),
                "println" => builtin_print(&arg_values),
                _ => Err(RuntimeError {
                    message: format!("undefined function `{func_name}`"),
                    offset: span.start,
                }),
            }
        }
    }
}

fn builtin_print(args: &[Value]) -> Result<Value, RuntimeError> {
    let parts: Vec<String> = args
        .iter()
        .map(|v| match v {
            Value::String(s) => s.clone(),
            Value::Int(n) => n.to_string(),
            Value::Float(n) => n.to_string(),
            Value::Unit => "()".to_string(),
        })
        .collect();
    println!("{}", parts.join(" "));
    Ok(Value::Unit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;
    use crate::effects::Effect;
    use crate::token::Span;

    #[test]
    fn execute_hello_world() {
        let module = Module {
            items: vec![Item::Function(Function {
                name: "main".into(),
                params: vec![],
                return_type: None,
                effects: vec![Effect::Console],
                body: vec![Stmt::Expr(Expr::Call {
                    callee: Box::new(Expr::Ident("print".into(), Span::new(0, 5))),
                    args: vec![Expr::StringLit("Hello, world.".into(), Span::new(6, 21))],
                    span: Span::new(0, 22),
                })],
                span: Span::new(0, 50),
            })],
        };
        // This should not error
        execute(&module).unwrap();
    }

    #[test]
    fn error_on_missing_main() {
        let module = Module {
            items: vec![Item::Function(Function {
                name: "not_main".into(),
                params: vec![],
                return_type: None,
                effects: vec![],
                body: vec![],
                span: Span::new(0, 20),
            })],
        };
        let err = execute(&module).unwrap_err();
        assert!(err.message.contains("no `fn main()`"));
    }
}
