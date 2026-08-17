# Grammar

Cue has two statement forms plus two anchor tiers. This document is the
authoritative syntax reference.

## BNF

```bnf
<statement>   ::= <cue> | <scope> | <sysnav> | <alias>

<cue>         ::= "[" <element> [ ":" <tag-chain> ] [ <scope> ] "]"
<tag-chain>   ::= <tag> { ">" <tag> }
<element>     ::= identifier
<tag>         ::= identifier

<scope>       ::= "{" <reference> "}"
<reference>   ::= "@" <path> [ ":" <line-range> ] | <glob>

<line-range>  ::= <start> "-" <end> | <start> "-" | "-" <end> | <start>

<sysnav>      ::= ":" <command> { <arg> } { ";" <sysnav> }
<alias>       ::= "/" <command>
```

A `{@file}` is a valid statement on its own — it does not require a `[...]`
wrapper. See [Scoped Directives](scoped-directives.md).

## Cue directives

### Default (no tag)

```
[Answer]
```
Executes the element with its default behavior.

### Tag variant

```
[Answer: Human]
```
Executes the element using the named tag variant.

### Composed tags

```
[Answer: Human > Brief]
```
Tags apply **left to right**. The leftmost tag is the primary lens; each
subsequent tag narrows it. Resolution rule: when tags conflict on a behavioral
dimension, the **leftmost** tag wins that dimension. Non-overlapping dimensions
stack.

### Scoped cue

```
[Answer: Technical]{@src/foo.rs}
```
Attaches the behavior to a specific injected chunk. The scope is a pointer to
content; the cue is the behavioral framing. See
[Scoped Directives](scoped-directives.md).

### Standalone form

```
[Answer: Human]
What is the speed of light?
```

The directive applies to the next content block — everything that follows until the
next directive or end of message.

## Scope-only directives

```
{@src/foo.rs}
{@src/**/*.rs}
```

Scopes are **first-class statements** — they work without a `[...]` wrapper.
A scope-only directive injects the referenced content as passive context. The
model sees the content and decides based on surrounding context; no behavioral
framing is applied.

| Form | Meaning |
|---|---|
| `{@path}` | inject the file's content |
| `{@path:10-20}` | inject lines 10-20 of the file |
| `{@glob}` | inject every matching file's content |

Scope-only directives compose with cues in the same message:

```
{@src/config.rs}
[Answer: Technical]{@src/main.rs}
```

First injects `config.rs` as passive context. Second injects `main.rs` with
technical behavioral framing. Two different intents, two different mechanisms.

See [Scoped Directives](scoped-directives.md) for the full specification.

## Colon tier (system nav)

```
:mode plan
:status; :cost
```

Message-initial only. Routed to the harness handler table and short-circuited
before any model call. Never reaches the model's context.

The `;` chains pure system commands in one line. It is *not* the `>` operator —
`>` is reserved for behavioral narrowing, `;` for sequencing harness commands.

## Alias tier

```
/commit
```

Expands to a Cue directive before dispatch. Aliases are **user-defined
shortcuts** — not a separate tier, just a mapping layer. They live in
configuration (`~/.pi/aliases.toml` or project `cue.toml`), not in the grammar
itself. The grammar defines the `/command` form; the mapping is configuration.

### How aliases bridge skills and cues

Skills and cues are orthogonal:
- **Skills** define *what* an agent can do (capabilities, tools, instructions)
- **Cues** define *how* the agent behaves (tone, length, depth, constraints)

Aliases bind them together:

```toml
# ~/.pi/aliases.toml
commit = "[Commit]{@git, tone: concise, style: conventional}"
review = "[Review: Technical]{@code, depth: high}"
explain = "[Explain]{@docs, length: brief}"
```

When you type `/commit`:
1. Alias expands to `[Commit]{@git, tone: concise, style: conventional}`
2. The skill (`commit`) provides git tools and commit instructions
3. The cue (`[Commit]{@git, tone: concise}`) constrains the output style
4. Both get injected into the system prompt for that turn

The skill is what the agent CAN do. The cue is HOW it does it. The alias is the
shorthand that binds them.

### Resolution

Alias expansion happens **before** the scanner runs. The dispatcher checks
message-initial `/command`, looks up the alias, and replaces it with the
target Cue. From that point, the scanner processes it like any other Cue
directive — inheriting composition, scoping, and all behavioral dimensions.

If the alias target includes a scope (`{@git}`), the dispatcher resolves it
the same way as a scoped cue. If it targets an unregistered element, the
dispatcher reports the error the same way as an unregistered cue.

## Exclusion zones

Directive syntax is not parsed inside fenced code blocks (` ``` ` or ` ~~~ `) or
inline code spans (single backticks). This lets users *mention* directives without
*activating* them:

```
Use `[Answer: NoSlop]` when you want terse output.
```

The backtick convention is intentional — users naturally reach for inline code when
talking *about* syntax. The scanner doesn't guess intent; it respects the exclusion
boundary.

| Zone | Syntax | Excludes |
|---|---|---|
| Fenced block | ` ``` ... ``` ` | All directives and scopes |
| Fenced block | `~~~ ... ~~~` | All directives and scopes |
| Inline code | `` ` ... ` `` | All directives and scopes |

## Malformed directives

| Input | Behavior |
|---|---|
| `[Answer Human]` | "Malformed directive — did you mean `[Answer: Human]`?" |
| `:exit` mid-sentence | Not parsed (colon is message-initial only) |
| `[Foo]` where `Foo` unregistered | "Element 'Foo' not defined" |
| `[Answer: Telepathic]` | "Tag 'Telepathic' not defined for Answer" |
| `[Translate]` (no scope) | "Transform requires a scope — use `[Translate]{@path}`" |
| `[Answer]{#undefined}` | "Mark '#undefined' not found" |
| `{#dup} ... {#dup}` | "Mark '#dup' defined multiple times" |

**Transform scope requirement:** Elements with `class: transform` must have a
scope. Transforms consume input and replace it — without a scope, there's
nothing to consume. `class: model` elements (behavioral framing) work without
scopes via the "next content block" rule; transforms are explicit.

## Naming rules

- **Elements:** short (1–2 syllables), verb or noun, unambiguous, no compound words.
  `Answer`, `Search`, `Code`, `Summarize`. Not `AnswerAndSearch`.
- **Tags:** adjective or noun, PascalCase, unambiguous in their element's context.
  `Human`, `Brief`, `Technical`. Not `NotFormal` (use `Casual`).
