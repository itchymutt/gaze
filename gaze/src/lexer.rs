use crate::token::{Span, Token, TokenKind};

pub struct Lexer<'a> {
    source: &'a str,
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Lexer<'a> {
    pub fn new(source: &'a str) -> Self {
        Lexer {
            source,
            bytes: source.as_bytes(),
            pos: 0,
        }
    }

    pub fn tokenize(&mut self) -> Result<Vec<Token>, LexError> {
        let mut tokens = Vec::new();
        loop {
            self.skip_whitespace_and_comments();
            if self.pos >= self.bytes.len() {
                tokens.push(Token {
                    kind: TokenKind::Eof,
                    span: Span::new(self.pos, self.pos),
                });
                break;
            }
            tokens.push(self.next_token()?);
        }
        Ok(tokens)
    }

    fn skip_whitespace_and_comments(&mut self) {
        loop {
            // Skip whitespace
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_whitespace() {
                self.pos += 1;
            }
            // Skip line comments
            if self.pos + 1 < self.bytes.len()
                && self.bytes[self.pos] == b'/'
                && self.bytes[self.pos + 1] == b'/'
            {
                while self.pos < self.bytes.len() && self.bytes[self.pos] != b'\n' {
                    self.pos += 1;
                }
                continue;
            }
            break;
        }
    }

    fn next_token(&mut self) -> Result<Token, LexError> {
        let start = self.pos;
        let b = self.bytes[self.pos];

        // String literals
        if b == b'"' {
            return self.lex_string();
        }

        // Numbers
        if b.is_ascii_digit() {
            return self.lex_number();
        }

        // Identifiers and keywords
        if b.is_ascii_alphabetic() || b == b'_' {
            return Ok(self.lex_ident());
        }

        // Punctuation and operators
        self.pos += 1;
        let kind = match b {
            b'(' => TokenKind::LParen,
            b')' => TokenKind::RParen,
            b'{' => TokenKind::LBrace,
            b'}' => TokenKind::RBrace,
            b'[' => TokenKind::LBracket,
            b']' => TokenKind::RBracket,
            b',' => TokenKind::Comma,
            b':' => TokenKind::Colon,
            b';' => TokenKind::Semicolon,
            b'.' => TokenKind::Dot,
            b'+' => TokenKind::Plus,
            b'*' => TokenKind::Star,
            b'/' => TokenKind::Slash,
            b'-' => {
                if self.peek() == Some(b'>') {
                    self.pos += 1;
                    TokenKind::Arrow
                } else {
                    TokenKind::Minus
                }
            }
            b'=' => {
                if self.peek() == Some(b'=') {
                    self.pos += 1;
                    TokenKind::EqEq
                } else if self.peek() == Some(b'>') {
                    self.pos += 1;
                    TokenKind::FatArrow
                } else {
                    TokenKind::Eq
                }
            }
            b'!' => {
                if self.peek() == Some(b'=') {
                    self.pos += 1;
                    TokenKind::BangEq
                } else {
                    TokenKind::Bang
                }
            }
            b'<' => {
                if self.peek() == Some(b'=') {
                    self.pos += 1;
                    TokenKind::LtEq
                } else {
                    TokenKind::Lt
                }
            }
            b'>' => {
                if self.peek() == Some(b'=') {
                    self.pos += 1;
                    TokenKind::GtEq
                } else {
                    TokenKind::Gt
                }
            }
            b'?' => {
                if self.peek() == Some(b'?') {
                    self.pos += 1;
                    TokenKind::DoubleQuestion
                } else {
                    TokenKind::Question
                }
            }
            b'|' => {
                if self.peek() == Some(b'>') {
                    self.pos += 1;
                    TokenKind::Pipe
                } else {
                    return Err(LexError {
                        message: "unexpected character '|' (did you mean '|>'?)".into(),
                        offset: start,
                    });
                }
            }
            _ => {
                return Err(LexError {
                    message: format!("unexpected character '{}'", b as char),
                    offset: start,
                });
            }
        };

        Ok(Token {
            kind,
            span: Span::new(start, self.pos),
        })
    }

    fn lex_string(&mut self) -> Result<Token, LexError> {
        let start = self.pos;
        self.pos += 1; // skip opening "
        let mut value = String::new();

        while self.pos < self.bytes.len() && self.bytes[self.pos] != b'"' {
            if self.bytes[self.pos] == b'\\' {
                self.pos += 1;
                if self.pos >= self.bytes.len() {
                    return Err(LexError {
                        message: "unterminated string escape".into(),
                        offset: start,
                    });
                }
                match self.bytes[self.pos] {
                    b'n' => value.push('\n'),
                    b't' => value.push('\t'),
                    b'\\' => value.push('\\'),
                    b'"' => value.push('"'),
                    other => {
                        return Err(LexError {
                            message: format!("unknown escape '\\{}'", other as char),
                            offset: self.pos - 1,
                        });
                    }
                }
            } else {
                value.push(self.bytes[self.pos] as char);
            }
            self.pos += 1;
        }

        if self.pos >= self.bytes.len() {
            return Err(LexError {
                message: "unterminated string literal".into(),
                offset: start,
            });
        }
        self.pos += 1; // skip closing "

        Ok(Token {
            kind: TokenKind::StringLit(value),
            span: Span::new(start, self.pos),
        })
    }

    fn lex_number(&mut self) -> Result<Token, LexError> {
        let start = self.pos;
        let mut is_float = false;

        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
            self.pos += 1;
        }
        if self.pos < self.bytes.len() && self.bytes[self.pos] == b'.' {
            is_float = true;
            self.pos += 1;
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
                self.pos += 1;
            }
        }

        let text = &self.source[start..self.pos];
        let kind = if is_float {
            TokenKind::FloatLit(text.parse().map_err(|_| LexError {
                message: format!("invalid float literal '{text}'"),
                offset: start,
            })?)
        } else {
            TokenKind::IntLit(text.parse().map_err(|_| LexError {
                message: format!("invalid integer literal '{text}'"),
                offset: start,
            })?)
        };

        Ok(Token {
            kind,
            span: Span::new(start, self.pos),
        })
    }

    fn lex_ident(&mut self) -> Token {
        let start = self.pos;
        while self.pos < self.bytes.len()
            && (self.bytes[self.pos].is_ascii_alphanumeric() || self.bytes[self.pos] == b'_')
        {
            self.pos += 1;
        }
        let text = &self.source[start..self.pos];
        let kind = match text {
            "fn" => TokenKind::Fn,
            "can" => TokenKind::Can,
            "let" => TokenKind::Let,
            "struct" => TokenKind::Struct,
            "enum" => TokenKind::Enum,
            "match" => TokenKind::Match,
            "pub" => TokenKind::Pub,
            "return" => TokenKind::Return,
            "if" => TokenKind::If,
            "else" => TokenKind::Else,
            _ => TokenKind::Ident(text.to_string()),
        };
        Token {
            kind,
            span: Span::new(start, self.pos),
        }
    }

    fn peek(&self) -> Option<u8> {
        if self.pos < self.bytes.len() {
            Some(self.bytes[self.pos])
        } else {
            None
        }
    }
}

#[derive(Debug)]
pub struct LexError {
    pub message: String,
    pub offset: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lex_hello_world() {
        let source = r#"fn main() can Console {
    print("Hello, world.")
}"#;
        let tokens = Lexer::new(source).tokenize().unwrap();
        let kinds: Vec<_> = tokens.iter().map(|t| &t.kind).collect();
        assert_eq!(kinds[0], &TokenKind::Fn);
        assert_eq!(kinds[1], &TokenKind::Ident("main".into()));
        assert_eq!(kinds[2], &TokenKind::LParen);
        assert_eq!(kinds[3], &TokenKind::RParen);
        assert_eq!(kinds[4], &TokenKind::Can);
        assert_eq!(kinds[5], &TokenKind::Ident("Console".into()));
        assert_eq!(kinds[6], &TokenKind::LBrace);
        assert_eq!(kinds[7], &TokenKind::Ident("print".into()));
        assert_eq!(kinds[8], &TokenKind::LParen);
        assert_eq!(kinds[9], &TokenKind::StringLit("Hello, world.".into()));
        assert_eq!(kinds[10], &TokenKind::RParen);
        assert_eq!(kinds[11], &TokenKind::RBrace);
        assert_eq!(kinds[12], &TokenKind::Eof);
    }

    #[test]
    fn lex_skips_comments() {
        let source = "// this is a comment\nfn main() {}";
        let tokens = Lexer::new(source).tokenize().unwrap();
        assert_eq!(tokens[0].kind, TokenKind::Fn);
    }

    #[test]
    fn lex_pipe_operator() {
        let source = "a |> b";
        let tokens = Lexer::new(source).tokenize().unwrap();
        assert_eq!(tokens[1].kind, TokenKind::Pipe);
    }

    #[test]
    fn lex_arrow_and_fat_arrow() {
        let source = "-> =>";
        let tokens = Lexer::new(source).tokenize().unwrap();
        assert_eq!(tokens[0].kind, TokenKind::Arrow);
        assert_eq!(tokens[1].kind, TokenKind::FatArrow);
    }
}
