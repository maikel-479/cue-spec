# Scoped Directives

Scopes are **first-class statements** — they work with or without a `[...]`
cue wrapper. A scope is a pointer to content; it answers "what chunk?" independently
of "how to behave?"

## Two forms

### Scope-only (passive injection)

```
{@src/foo.rs}
{#id}
{$last}
{@src/**/*.rs}
```

Injects the referenced content as passive context. The model sees the content and
decides based on surrounding context. No behavioral framing is applied.

This is how `@`-file injection already works in every harness — Cue scopes extend
it with globs, line ranges, id references, and `{$last}`.

### Scoped cue (behavior + content)

```
[Answer: Technical]{@src/foo.rs}
[Summarize: Brief]{@src/**/*.rs}
```

Attaches behavioral framing to a specific content chunk. The cue provides the
"how to behave" and the scope provides the "what content."

## Syntax

```
<scope>       ::= "{" <reference> "}"
<reference>   ::= "@" <path> | "#" <id> | "$last" | <glob>
```

| Form | Meaning |
|---|---|
| `{@path}` | inject the file's content |
| `{#id}` | inject the marked block's content (see [grammar.md](grammar.md)) |
| `{$last}` | inject the most recent tool/fetch result |
| `{@glob}` | inject every matching file's content |

## Scope-only directives

Scope-only directives are the minimal form: reference content, inject it, done.

```
{@src/config.rs}
```

The dispatcher reads `src/config.rs` and injects its content as context. The model
receives it alongside the user's message and uses it as reference material.

### When to use scope-only

- **Passive context:** "Here's the config, keep it in mind" — no behavioral framing
  needed
- **Multiple files, same treatment:** inject several files as background context
- **Inline references:** mention a file in the middle of a sentence without wrapping
  it in a directive

### Behavior

- **augment by default** — scope-only never replaces or consumes content; it adds it
  to context
- **No error on missing file** — if the referenced file doesn't exist, the scope
  produces a warning but doesn't block the message
- **Glob expansion** — `{@src/**/*.rs}` resolves to N separate injections, one per
  matched file

## Composing scopes with cues

Scopes and cues compose independently:

```
{@src/config.rs}
[Answer: Technical]{@src/main.rs}
```

Two injections: `config.rs` as passive context, `main.rs` with technical behavioral
framing. The coalescer treats them as separate dispatches (different scope targets,
and one is scope-only while the other is a cue).

```
[Answer: Technical]{@src/foo.rs}
[Answer: Human]{@src/bar.rs}
```

Two files, two lenses, zero ambiguity. Strictly more scalable than "applies to
everything downstream."

## Glob scope

```
{@src/**/*.rs}
```

```
[Summarize: Brief]{@src/**/*.rs}
```

Both forms inject every matched file. The scope-only form injects as passive
context. The scoped cue form attaches behavioral framing to each match.

The tracer runs the glob, resolves each match, and produces one injection per file.
One statement, N files.

## Resolution rules

### Scope-only

1. The scanner finds `{@src/foo.rs}`.
2. The resolver reads the file content.
3. The injector adds it to context as a passive reference chunk.
4. The model sees the content alongside the user's message.

### Scoped cue

1. The scanner finds `[Answer: Technical]{@src/foo.rs}`.
2. The resolver traces `Technical` via [sectional-tracing](sectional-tracing.md).
3. Instead of injecting as a global augmentation, the traced text attaches to the
   `src/foo.rs` context chunk's slot.
4. If no other input is present, the `@path` chunk **is** the input.

So `[Answer: Technical]{@src/foo.rs}` = "answer technically about src/foo.rs" — no
wrap needed.

## Scope modes: augment vs replace

A scope answers *which chunk the directive governs*. It does not answer whether the
directive's output **replaces** or **augments** that chunk's treatment. That is the
mode, and it is an **element-level property**, not user syntax:

| Mode | Element class | Behavior | Use for |
|---|---|---|---|
| `augment` (default) | `class: model` | Attach behavioral annotation to the chunk | `Answer`, `Review`, `Explain` |
| `replace` | `class: transform` | Consume the chunk; the directive's output stands in | `Translate`, `Summarize`, `Format` |

Scope-only directives are always **augment** — they inject content without
consuming or transforming it.

The mode for scoped cues is determined by the element's `class` in its `.toml`
definition. Users do not write `:augment` or `:replace` suffixes.

`augment` is the default because it **fails safe** — it never deletes user content,
only adds framing. `replace` requires explicit opt-in via `class: transform`. This
is a deliberate engineering choice: a destructive mode must be explicit.
