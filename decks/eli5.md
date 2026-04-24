---
marp: true
theme: gaze-theme
paginate: true
---

<!-- _class: lead -->

# What I've been building

A tool that tells you what code does
before you run it

---

## The new problem

AI used to suggest things. Now it acts.

Companies run AI agents that write code and execute it
on real servers, with real data, without a human approving
each step. The code can read files, make network calls,
install software, delete things.

The question is: how do you know what it's doing?

---

## Nutrition labels

You don't need to be a chemist to read a nutrition label.
You just need the label to exist.

**I built nutrition labels for code.**

Ten categories. If a piece of code talks to the internet, it says *Net*.
If it reads your files, it says *Fs*. If it does nothing to the world,
it says *pure*.

---

<!-- _class: ingredients -->

## Ten ingredients

Every piece of code does some combination of these things:

| | | |
|---|---|---|
| **Net** talks to the internet | **Fs** reads or writes files | **Db** talks to a database |
| **Console** prints to the screen | **Env** reads settings/passwords | **Time** checks the clock or waits |
| **Rand** generates random numbers | **Async** does many things at once | **Unsafe** runs other programs |
| **Fail** can crash on purpose | | |

If none of these apply, the code is *pure*. It just computes.

---

## What it looks like

You point my tool at a file and it tells you:

```
code_interpreter.py

  run_code_unsafe    ⚠ Unsafe
    os.system("pip install ...")    ← runs any shell command
    exec(code)                     ← runs any code

  validate_url       ✓ pure
  parse_headers      ✓ pure
  format_output      ✓ pure
```

Four functions. One is dangerous. Three are safe.
Now you know which one to look at.

---

## What I found when I used it

I scanned the tools from three major AI agent frameworks.
These are tools that thousands of companies run automatically.

One of them, called "Code Interpreter," lets the AI install
any software on your computer by typing a name into a string.
No approval. No confirmation. It's like giving someone your
house keys because they said they're a locksmith.

My tool catches this automatically.

---

## It works at scale

I built two versions of the tool: one for Python, one for TypeScript.
Same ten labels, different programming languages.

**3,211 files. 15,293 functions. Two languages.**

- 68% of the code is pure (just computes, no side effects)
- The labels didn't change between languages
- Every dangerous function I checked was correctly flagged

---

## The bigger idea

I also designed a programming language called Gaze
where these labels are built into the language itself.

```
fn read_file(path) can Fs -> String {
    // this function is allowed to read files
}

fn calculate(x) -> Number {
    // this function is NOT allowed to read files
    // if it tries, the program won't compile
}
```

The language forces you to be honest about what your code does.
If you don't declare it, you can't do it.

---

## Why I built this

I've always been drawn to the invisible layers,
the systems underneath the software you touch every day.

AI agents are the next invisible layer. They write code
and run it without asking. Someone needs to make that visible.

I wanted to see if I could build something meaningful here.
Not as an engineer. As a designer who thinks about
how systems should work.

---

<!-- _class: lead -->

# The tool is called Gaze

Because the first step to safety
is being able to see what's happening.

