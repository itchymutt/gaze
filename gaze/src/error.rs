/// Reconstruct line and column from a byte offset by scanning source.
/// This is the Zig pattern: store cheap (byte offset), reconstruct expensive
/// (line/col) only when an error needs to be displayed.
pub fn offset_to_line_col(source: &str, offset: u32) -> (usize, usize) {
    let offset = offset as usize;
    let mut line = 1;
    let mut col = 1;
    for (i, ch) in source.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

/// Get the source line containing a byte offset.
fn get_source_line(source: &str, offset: u32) -> &str {
    let offset = offset as usize;
    let start = source[..offset]
        .rfind('\n')
        .map(|i| i + 1)
        .unwrap_or(0);
    let end = source[offset..]
        .find('\n')
        .map(|i| i + offset)
        .unwrap_or(source.len());
    &source[start..end]
}

/// Format an error with source context, caret, and optional help.
pub fn format_error(source: &str, path: &str, offset: u32, message: &str) -> String {
    format_error_with_help(source, path, offset, message, None)
}

/// Format an effect error with source context, caret, and a fix suggestion.
pub fn format_effect_error(
    source: &str,
    path: &str,
    offset: u32,
    func_name: &str,
    callee: &str,
    effect: &crate::effects::Effect,
) -> String {
    let (line, col) = offset_to_line_col(source, offset);
    let source_line = get_source_line(source, offset);
    let line_num_width = line.to_string().len();
    let padding = " ".repeat(line_num_width);
    let caret_padding = " ".repeat(col - 1);
    let caret = "^".repeat(callee.len());

    let help = format!(
        "add `can {effect}` to the function signature:\n\
         {padding}  |\n\
         {padding}  |  fn {func_name}() can {effect} {{"
    );

    format!(
        "error: `{callee}` requires `can {effect}`\n\
         {padding} --> {path}:{line}:{col}\n\
         {padding}  |\n\
         {line:<line_num_width$}  | {source_line}\n\
         {padding}  | {caret_padding}{caret} this function performs {effect} effects\n\
         {padding}  |\n\
         {padding}  = help: {help}",
        line_num_width = line_num_width,
    )
}

pub fn format_error_with_help(
    source: &str,
    path: &str,
    offset: u32,
    message: &str,
    help: Option<&str>,
) -> String {
    let (line, col) = offset_to_line_col(source, offset);
    let source_line = get_source_line(source, offset);
    let line_num_width = line.to_string().len();
    let padding = " ".repeat(line_num_width);

    let mut out = format!(
        "error: {message}\n\
         {padding} --> {path}:{line}:{col}\n\
         {padding}  |\n\
         {line:<line_num_width$}  | {source_line}\n\
         {padding}  |",
        line_num_width = line_num_width,
    );

    if let Some(help) = help {
        out.push_str(&format!("\n{padding}  = help: {help}"));
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_char() {
        assert_eq!(offset_to_line_col("hello", 0), (1, 1));
    }

    #[test]
    fn second_line() {
        assert_eq!(offset_to_line_col("ab\ncd", 3), (2, 1));
    }

    #[test]
    fn middle_of_second_line() {
        assert_eq!(offset_to_line_col("ab\ncd", 4), (2, 2));
    }

    #[test]
    fn get_line_first() {
        assert_eq!(get_source_line("hello\nworld", 2), "hello");
    }

    #[test]
    fn get_line_second() {
        assert_eq!(get_source_line("hello\nworld", 8), "world");
    }
}
