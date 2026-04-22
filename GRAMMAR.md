# Lux Grammar (Draft)

PEG-style grammar. Not yet formal enough for parser generation, but precise enough to argue about.

## Notation

```
'literal'     exact string
UPPER         token class (from lexer)
lower         grammar rule
a b           sequence
a | b         ordered choice
a?            optional
a*            zero or more
a+            one or more
(a b)         grouping
```

## Lexical Grammar

### Keywords

```
fn let pub struct enum match if else return
inout sink boundary import as type trait impl
for in while break continue true false
```

### Reserved (for future use)

```
async await yield effect handle with do
macro comptime where
```

### Tokens

```
IDENT       = [a-zA-Z_][a-zA-Z0-9_]*
INT         = [0-9][0-9_]*
FLOAT       = [0-9][0-9_]* '.' [0-9][0-9_]*
STRING      = '"' (escape | [^"\\])* '"'
CHAR        = '\'' (escape | [^'\\]) '\''
escape      = '\\' [nrt\\'"0]

COMMENT     = '//' [^\n]*
DOC_COMMENT = '///' [^\n]*
```

### Operators and Punctuation

```
+  -  *  /  %
== != < > <= >=
&& || !
|> ?
= += -= *= /=
-> => !
:: : ; , .
( ) [ ] { }
```

## Syntax Grammar

### Top Level

```
program     = item*
item        = fn_def | struct_def | enum_def | type_alias | import | trait_def | impl_block
```

### Imports

```
import      = 'import' path ('as' IDENT)?
path        = IDENT ('::' IDENT)*
```

### Functions

```
fn_def      = 'pub'? 'fn' IDENT generics? '(' params? ')' return_type? effects? block

params      = param (',' param)* ','?
param       = passing? IDENT ':' type
passing     = 'let' | 'inout' | 'sink'

return_type = '->' type
effects     = '!' '{' effect_list '}'
effect_list = IDENT (',' IDENT)* ','?

generics    = '<' generic_param (',' generic_param)* '>'
generic_param = IDENT (':' type_bound)?
type_bound  = IDENT ('+' IDENT)*
```

### Types

```
type        = type_name generics_args?
            | fn_type
            | tuple_type
            | '(' type ')'

type_name   = path
generics_args = '<' type (',' type)* '>'

fn_type     = 'fn' '(' type_list? ')' return_type? effects?
type_list   = type (',' type)*

tuple_type  = '(' type ',' type (',' type)* ')'
```

### Structs

```
struct_def  = 'pub'? 'struct' IDENT generics? '{' field_list? '}'
field_list  = field (',' field)* ','?
field       = 'pub'? IDENT ':' type
```

### Enums

```
enum_def    = 'pub'? 'enum' IDENT generics? '{' variant_list? '}'
variant_list = variant (',' variant)* ','?
variant     = IDENT variant_data?
variant_data = '(' type_list ')' | '{' field_list '}'
```

### Traits

```
trait_def   = 'pub'? 'trait' IDENT generics? '{' trait_item* '}'
trait_item  = fn_sig ';'
fn_sig      = 'fn' IDENT generics? '(' params? ')' return_type? effects?

impl_block  = 'impl' generics? type_name generics_args? 'for' type '{' fn_def* '}'
```

### Subscripts

```
subscript   = 'subscript' IDENT '[' params ']' '(' passing 'self' ':' type ')' return_type? block
```

### Statements

```
block       = '{' statement* expr? '}'

statement   = let_stmt
            | assign_stmt
            | expr_stmt
            | return_stmt
            | if_stmt
            | match_stmt
            | for_stmt
            | while_stmt
            | boundary_stmt

let_stmt    = 'let' pattern (':' type)? '=' expr ';'
assign_stmt = place '=' expr ';'
expr_stmt   = expr ';'
return_stmt = 'return' expr? ';'
```

### Expressions

```
expr        = pipeline

pipeline    = logical_or ('|>' fn_call_tail)*
fn_call_tail = IDENT '(' args? ')' effects? '?'?

logical_or  = logical_and ('||' logical_and)*
logical_and = comparison ('&&' comparison)*
comparison  = addition (comp_op addition)?
comp_op     = '==' | '!=' | '<' | '>' | '<=' | '>='

addition    = multiplication (('+' | '-') multiplication)*
multiplication = unary (('*' | '/' | '%') unary)*

unary       = ('-' | '!') unary | postfix
postfix     = primary (call | index | field | try)*

call        = '(' args? ')' effects?
index       = '[' expr ']'
field       = '.' IDENT
try         = '?'

primary     = INT | FLOAT | STRING | CHAR | 'true' | 'false'
            | IDENT
            | path
            | struct_literal
            | closure
            | if_expr
            | match_expr
            | block
            | '(' expr ')'

args        = arg (',' arg)* ','?
arg         = (IDENT ':')? expr

struct_literal = type_name '{' field_init_list? '}'
field_init_list = field_init (',' field_init)* ','?
field_init  = IDENT ':' expr | IDENT   // shorthand: name == value

closure     = '|' params? '|' expr
            | '|' params? '|' block
```

### Pattern Matching

```
if_expr     = 'if' expr block ('else' (if_expr | block))?

match_expr  = 'match' expr '{' match_arm+ '}'
match_arm   = pattern '=>' expr ','

pattern     = '_'
            | IDENT
            | literal_pattern
            | path '(' pattern_list? ')'
            | path '{' field_pattern_list? '}'
            | pattern '|' pattern

pattern_list = pattern (',' pattern)*
field_pattern_list = field_pattern (',' field_pattern)*
field_pattern = IDENT ':' pattern | IDENT
```

### Effect Boundaries

```
boundary_stmt = 'boundary' '{' effect_list '}' block
```

## Precedence (highest to lowest)

1. Field access (`.`), indexing (`[]`), function call (`()`)
2. Unary (`-`, `!`)
3. Multiplicative (`*`, `/`, `%`)
4. Additive (`+`, `-`)
5. Comparison (`==`, `!=`, `<`, `>`, `<=`, `>=`)
6. Logical AND (`&&`)
7. Logical OR (`||`)
8. Pipeline (`|>`)
9. Assignment (`=`)

## Notes

- No semicolons after blocks (if/match/for/while that end with `}`)
- Trailing commas allowed everywhere
- No implicit returns except the last expression in a block
- `!` in effect position is always followed by `{...}`, distinguishing it from logical NOT
- `?` for error propagation, `!` for effect propagation: two distinct concerns, two distinct operators
