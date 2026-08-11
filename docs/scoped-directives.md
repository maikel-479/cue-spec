# Scoped Directives

Attach behavior to a *specific chunk* of content, not "everything after the
directive."

## The problem

The base directive applies to the next block or to wrapped content. That's global
within the message. For a code agent, you usually want behavior scoped to *one file*
or *one result* — and you already have `@`-file injection for content. Cue lets you
attach behavior to that same injected chunk.

## Syntax

A scope annotation lives inside `{}` after the directive. It is a **pointer, never a
payload**:

```
[Element: Tag]{@path}
[Element: Tag]{#id}
[Element: Tag]{$last}
[Element: Tag]{@glob}
```

| Form | Meaning |
|---|---|
| `{@path}` | the `@`-injected file chunk |
| `{#id}` | a named block marked earlier in the message |
| `{$last}` | the most recent tool / fetch result |
| `{@glob}` | every chunk matching a glob (e.g. `@src/**/*.rs`) |

## Resolution rules

1. The scanner finds `[Answer: Technical]{@src/foo.rs}`.
2. It traces `Technical` normally.
3. Instead of injecting as a global system augmentation, it attaches the traced text
   to the `src/foo.rs` context chunk's slot.
4. If no other input is present, the `@path` chunk **is** the input.

So `[Answer: Technical]{@src/foo.rs}` = "answer technically about src/foo.rs" — no
wrap needed.

## Composes cleanly

```
[Answer: Technical]{@src/foo.rs}
[Answer: Human]{@src/bar.rs}
```

Two files, two lenses, zero ambiguity. Strictly more scalable than "applies to
everything downstream."

## Glob scope

```
[Summarize: Brief]{@src/**/*.rs}
```

Attaches to **every** matched chunk. The tracer runs the glob, resolves each match to
its context slot, and injects the traced section into each. One directive, N files.

## Scope modes: augment vs replace

A scope answers *which chunk the directive governs*. It does not answer whether the
directive's output **replaces** or **augments** that chunk's treatment. That is the
mode, and it is an **element-level property**, not user syntax:

| Mode | Element class | Behavior | Use for |
|---|---|---|---|
| `augment` (default) | `class: model` | Attach behavioral annotation to the chunk | `Answer`, `Review`, `Explain` |
| `replace` | `class: transform` | Consume the chunk; the directive's output stands in | `Translate`, `Summarize`, `Format` |

The mode is determined by the element's `class` in its `.toml` definition. Users
do not write `:augment` or `:replace` suffixes — the element's class determines
the behavior.

`augment` is the default because it **fails safe** — it never deletes user content,
only adds framing. `replace` requires explicit opt-in via `class: transform`. This
is a deliberate engineering choice: a destructive mode must be explicit.

## Interaction with scoped content

- No scope → next block
- Scope → `@path` chunk is both input and annotation target

The `{...}` scope is strictly a pointer. Inline payloads use the standalone form
(next-block attachment). That separation means the parser never guesses whether
`{...}` holds a path or content.
