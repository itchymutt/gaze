/// Byte offset span into source text.
/// Line/column reconstructed on demand (see error.rs).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: u32,
    pub end: u32,
}

impl Span {
    pub fn new(start: usize, end: usize) -> Self {
        Span {
            start: start as u32,
            end: end as u32,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TokenKind {
    // Keywords
    Fn,
    Can,
    Let,
    Struct,
    Enum,
    Match,
    Pub,
    Return,
    If,
    Else,

    // Literals
    StringLit(String),
    IntLit(i64),
    FloatLit(f64),

    // Identifiers
    Ident(String),

    // Delimiters
    LParen,
    RParen,
    LBrace,
    RBrace,
    LBracket,
    RBracket,

    // Punctuation
    Comma,
    Colon,
    Semicolon,
    Arrow,      // ->
    FatArrow,   // =>
    Dot,
    Pipe,       // |>
    Question,   // ?

    // Operators
    Plus,
    Minus,
    Star,
    Slash,
    Eq,         // =
    EqEq,       // ==
    BangEq,     // !=
    Lt,
    Gt,
    LtEq,
    GtEq,
    DoubleQuestion, // ??
    Bang,

    // Special
    Eof,
}
