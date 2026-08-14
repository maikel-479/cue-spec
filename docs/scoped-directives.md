# Scoped Directives

Scopes are **first-class statements** — they work with or without a `[...]`
cue wrapper. A scope is a pointer to content; it answers "what chunk?" independently
of "how to behave?"

## Two forms

### Scope-only (passive injection)

```
{@src/foo.rs}
{#id}
{@src/**/*.rs}
```

Injects the referenced content as passive context. The model sees the content and
decides based on surrounding context. No behavioral framing is applied.

This is how `@`-file injection already works in every harness — Cue scopes extend
it with globs, line ranges, and id references.

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
<reference>   ::= "@" <path> [ ":" <line-range> ] | "#" <id> | <glob>

<line-range>  ::= <start> "-" <end>
                | <start> "-"
                | "-" <end>
                | <start>

<start>       ::= integer
<end>         ::= integer
```

| Form | Meaning |
|---|---|
| `{@path}` | inject the file's content |
| `{@path:10}` | inject line 10 only |
| `{@path:10-20}` | inject lines 10 through 20 (inclusive) |
| `{@path:10-}` | inject from line 10 to end of file |
| `{@path:-20}` | inject first 20 lines |
| `{#id}` | inject the marked block's content |
| `{@glob}` | inject every matching file's content |

### Line ranges

Line ranges are 1-indexed and inclusive. They work with all file scopes:

```
{@src/foo.rs:10-20}                    ← passive, lines 10-20
[Answer: Technical]{@src/foo.rs:1-50}  ← technical behavior, first 50 lines
```

**ScopeRef type:**

```typescript
export interface ScopeRef {
  type: "file" | "id" | "glob";
  value: string;
  lineRange?: { start?: number; end?: number };
}
```

When `lineRange` is present:
- `start` defined, `end` defined → lines start through end
- `start` defined, `end` undefined → lines start through EOF
- `start` undefined, `end` defined → lines 1 through end
- Neither defined → entire file (same as no line range)

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
- **Deduplication** — identical scope-only directives (same content hash) are
  deduplicated. `{@src/foo.rs}` twice = one injection

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

## Injection order

Scopes appear in the prompt in the **same order** they appear in the user's message.

```
{@src/config.rs}                        ← 1st
{@src/main.rs}                          ← 2nd
[Answer: Technical]{@src/foo.rs}        ← 3rd
```

Model sees:
```
--- src/config.rs ---
[key]
value = "default"

--- src/main.rs ---
fn main() { ... }

--- src/foo.rs ---
fn helper() { ... }

--- framing ---
## Default Behavior
Answer technically about this file...
```

The user controls ordering by writing scopes in the desired order.

## Content format

### Scope-only

Raw content with a header identifying the source:

```
--- src/config.rs ---
[key]
value = "default"
```

### Scoped cue

Content with behavioral framing attached:

```
--- src/foo.rs ---
fn main() {
    println!("hello");
}

--- framing ---
## Default Behavior
Answer technically about this file...
```

Raw content is token-efficient. The header identifies the source. No code block
wrapping (avoids nesting issues).

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

### Glob limits

- **Default:** 50 files per glob statement
- **Configurable:** `[cue] max-glob-files = 100` in `cue.toml`
- **If exceeded:** warn and inject first N files

```
Warning: Glob {@src/**/*.rs} matched 127 files, injected first 50.
Refine your pattern or increase max-glob-files in cue.toml.
```

## Resolution rules

### Scope-only

1. The scanner finds `{@src/foo.rs}`.
2. The resolver reads the file content (optionally sliced by line range).
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

## Marked blocks: {#id}

Marks are structural labels for content blocks within a message. They enable
referencing inline content without file paths.

### Marking

A `{#id}` on its own line (not inside `[...]`) **marks** the following content
block:

```
{#my-block}
This is the content I want to reference later.

[Answer: Technical]{#my-block}
Explain this code.
```

The marked block extends **until the next directive** — `{#id}`, `[Element: ...]`,
`:command`, `/alias`, or end of message.

### Referencing

A `{#id}` inside a `[...]` directive **references** the marked block:

```
[Answer: Technical]{#my-block}
```

A `{#id}` as scope-only (on its own line, not inside `[...]`) also references the
marked block:

```
{#my-block}
```

### Disambiguation

| Position | Behavior |
|---|---|
| `{#id}` on its own line, NOT inside `[...]` | **Marks** the next content block |
| `{#id}` inside `[...]` | **References** the marked block |
| `{#id}` as scope-only, on its own line | **References** the marked block |

### Reference order

References can appear **before or after** marks. The dispatcher uses two-pass
scanning:

1. **First pass:** collect all marks and their content blocks
2. **Second pass:** resolve all references

```
[Answer: Technical]{#my-block}    ← reference (resolved in pass 2)
Explain this code.

{#my-block}                        ← mark (collected in pass 1)
fn main() { ... }
```

### Multiple references

Multiple cues can reference the same mark:

```
{#snippet}
fn main() { ... }

[Answer: Technical]{#snippet}
Explain technically.

[Answer: Human]{#snippet}
Explain simply.
```

Both cues inject the same content block, with different behavioral framing.

### Scope-only reference

A standalone `{#id}` on its own line injects the marked block as passive context:

```
{#config}
[key]
value = "default"

{#config}
```

Second `{#config}` injects the config content without behavioral framing.

### Exclusion zones

Marks inside fenced code blocks (` ``` ` or ` ~~~ `) and inline code spans are
**ignored**. Only standalone `{#id}` on its own line is treated as a mark.

```
This is NOT a mark: `{#snippet}`

```code
# This is NOT a mark either
```
```

### Validation

| Condition | Behavior |
|---|---|
| Reference to undefined mark | Error: "Mark '{#id}' not found" |
| Duplicate mark (same id) | Error: "Mark '{#id}' defined multiple times" |
| Mark with empty content block | Warning: "Mark '{#id}' has no content block" |

### Types

```typescript
export interface ScopeRef {
  type: "file" | "id" | "glob";
  value: string;
  lineRange?: { start?: number; end?: number };
}

// When type is "id", value is the mark identifier
// Example: {#my-block} → { type: "id", value: "my-block" }
```
