use crate::ast::*;

/// Format a module as canonical Gaze source.
pub fn format_module(module: &Module) -> String {
    let mut out = String::new();
    for (i, item) in module.items.iter().enumerate() {
        if i > 0 {
            out.push('\n');
        }
        match item {
            Item::Function(f) => format_function(f, &mut out),
            Item::Struct(s) => format_struct(s, &mut out),
            Item::Enum(e) => format_enum(e, &mut out),
        }
        out.push('\n');
    }
    out
}

fn format_function(f: &Function, out: &mut String) {
    out.push_str("fn ");
    out.push_str(&f.name);
    out.push('(');
    for (i, param) in f.params.iter().enumerate() {
        if i > 0 {
            out.push_str(", ");
        }
        out.push_str(&param.name);
        out.push_str(": ");
        out.push_str(&param.ty.name);
    }
    out.push(')');

    if let Some(ret) = &f.return_type {
        out.push_str(" -> ");
        out.push_str(&ret.name);
    }

    if !f.effects.is_empty() {
        out.push_str(" can ");
        let effs: Vec<&str> = f.effects.iter().map(|e| e.as_str()).collect();
        out.push_str(&effs.join(", "));
    }

    out.push_str(" {\n");
    format_body(&f.body, out, 1);
    out.push('}');
}

fn format_struct(s: &StructDef, out: &mut String) {
    out.push_str("struct ");
    out.push_str(&s.name);
    out.push_str(" {\n");
    for field in &s.fields {
        indent(out, 1);
        out.push_str(&field.name);
        out.push_str(": ");
        out.push_str(&field.ty.name);
        out.push_str(",\n");
    }
    out.push('}');
}

fn format_enum(e: &EnumDef, out: &mut String) {
    out.push_str("enum ");
    out.push_str(&e.name);
    out.push_str(" {\n");
    for variant in &e.variants {
        indent(out, 1);
        out.push_str(&variant.name);
        if !variant.fields.is_empty() {
            out.push('(');
            let types: Vec<&str> = variant.fields.iter().map(|t| t.name.as_str()).collect();
            out.push_str(&types.join(", "));
            out.push(')');
        }
        out.push_str(",\n");
    }
    out.push('}');
}

fn format_body(stmts: &[Stmt], out: &mut String, depth: usize) {
    for stmt in stmts {
        indent(out, depth);
        match stmt {
            Stmt::Let(l) => {
                out.push_str("let ");
                out.push_str(&l.name);
                out.push_str(" = ");
                format_expr(&l.value, out, depth);
            }
            Stmt::Expr(e) => {
                format_expr(e, out, depth);
            }
        }
        out.push('\n');
    }
}

fn format_expr(expr: &Expr, out: &mut String, depth: usize) {
    match expr {
        Expr::StringLit(s, _) => {
            out.push('"');
            // Escape special characters
            for ch in s.chars() {
                match ch {
                    '"' => out.push_str("\\\""),
                    '\\' => out.push_str("\\\\"),
                    '\n' => out.push_str("\\n"),
                    '\t' => out.push_str("\\t"),
                    _ => out.push(ch),
                }
            }
            out.push('"');
        }
        Expr::IntLit(n, _) => {
            out.push_str(&n.to_string());
        }
        Expr::FloatLit(n, _) => {
            out.push_str(&n.to_string());
        }
        Expr::BoolLit(b, _) => {
            out.push_str(if *b { "true" } else { "false" });
        }
        Expr::Ident(name, _) => {
            out.push_str(name);
        }
        Expr::Call { callee, args, .. } => {
            format_expr(callee, out, depth);
            out.push('(');
            for (i, arg) in args.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                format_expr(arg, out, depth);
            }
            out.push(')');
        }
        Expr::BinOp {
            op, left, right, ..
        } => {
            format_expr(left, out, depth);
            out.push(' ');
            out.push_str(binop_str(*op));
            out.push(' ');
            format_expr(right, out, depth);
        }
        Expr::StructLit { name, fields, .. } => {
            out.push_str(name);
            out.push_str(" { ");
            for (i, field) in fields.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                out.push_str(&field.name);
                out.push_str(": ");
                format_expr(&field.value, out, depth);
            }
            out.push_str(" }");
        }
        Expr::FieldAccess { object, field, .. } => {
            format_expr(object, out, depth);
            out.push('.');
            out.push_str(field);
        }
        Expr::Match {
            subject, arms, ..
        } => {
            out.push_str("match ");
            format_expr(subject, out, depth);
            out.push_str(" {\n");
            for arm in arms {
                indent(out, depth + 1);
                format_pattern(&arm.pattern, out);
                out.push_str(" => ");
                format_expr(&arm.body, out, depth + 1);
                out.push_str(",\n");
            }
            indent(out, depth);
            out.push('}');
        }
        Expr::If {
            condition,
            then_body,
            else_body,
            ..
        } => {
            out.push_str("if ");
            format_expr(condition, out, depth);
            out.push_str(" {\n");
            format_body(then_body, out, depth + 1);
            indent(out, depth);
            out.push('}');
            if let Some(else_stmts) = else_body {
                out.push_str(" else {\n");
                format_body(else_stmts, out, depth + 1);
                indent(out, depth);
                out.push('}');
            }
        }
    }
}

fn format_pattern(pattern: &Pattern, out: &mut String) {
    match pattern {
        Pattern::Wildcard(_) => out.push('_'),
        Pattern::Ident(name, _) => out.push_str(name),
        Pattern::IntLit(n, _) => out.push_str(&n.to_string()),
        Pattern::Variant {
            name, bindings, ..
        } => {
            out.push_str(name);
            out.push('(');
            out.push_str(&bindings.join(", "));
            out.push(')');
        }
    }
}

fn binop_str(op: BinOp) -> &'static str {
    match op {
        BinOp::Add => "+",
        BinOp::Sub => "-",
        BinOp::Mul => "*",
        BinOp::Div => "/",
        BinOp::Eq => "==",
        BinOp::NotEq => "!=",
        BinOp::Lt => "<",
        BinOp::Gt => ">",
        BinOp::LtEq => "<=",
        BinOp::GtEq => ">=",
    }
}

fn indent(out: &mut String, depth: usize) {
    for _ in 0..depth {
        out.push_str("    ");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::Lexer;
    use crate::parser::Parser;

    fn roundtrip(source: &str) -> String {
        let tokens = Lexer::new(source).tokenize().unwrap();
        let module = Parser::new(tokens).parse_module().unwrap();
        format_module(&module)
    }

    #[test]
    fn format_hello_world() {
        let out = roundtrip(r#"fn main() can Console { print("Hello, world.") }"#);
        assert_eq!(out, "fn main() can Console {\n    print(\"Hello, world.\")\n}\n");
    }

    #[test]
    fn format_struct() {
        let out = roundtrip("struct Point { x: Int, y: Int }");
        assert_eq!(out, "struct Point {\n    x: Int,\n    y: Int,\n}\n");
    }

    #[test]
    fn format_enum() {
        let out = roundtrip("enum Shape { Circle(Int), Rect(Int, Int) }");
        assert_eq!(
            out,
            "enum Shape {\n    Circle(Int),\n    Rect(Int, Int),\n}\n"
        );
    }

    #[test]
    fn format_is_idempotent() {
        let source = r#"
            struct Point { x: Int, y: Int }
            fn dist(p: Point) -> Int { p.x * p.x + p.y * p.y }
            fn main() can Console {
                let p = Point { x: 3, y: 4 }
                print(dist(p))
            }
        "#;
        let first = roundtrip(source);
        let second = roundtrip(&first);
        assert_eq!(first, second, "formatter is not idempotent");
    }

    #[test]
    fn format_if_else() {
        let out = roundtrip("fn f(x: Int) -> Int { if x > 0 { x } else { 0 - x } }");
        assert!(out.contains("if x > 0 {"));
        assert!(out.contains("} else {"));
    }

    #[test]
    fn format_match() {
        let out = roundtrip(r#"
            enum Color { Red, Blue }
            fn name(c: Color) -> String {
                match c { Red => "red", Blue => "blue" }
            }
        "#);
        assert!(out.contains("    Red => \"red\","));
        assert!(out.contains("    Blue => \"blue\","));
    }
}
