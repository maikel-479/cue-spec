# Grammar

Cue has one directive grammar plus two anchor tiers. This document is the
authoritative syntax reference.

## BNF

```bnf
<directive>   ::= "[" <element> [ ":" <tag-chain> ] [ <scope> ] "]"
<tag-chain>   ::= <tag> { ">" <tag> }
<element>     ::= identifier
<tag>         ::= identifier

<scope>       ::= "{" <reference> [ ":" <mode> ] "}"
<reference>   ::= "@" <path> | "#" <id> | "$last" | <glob>
<mode>        ::= "augment" | "replace"

<sysnav>      ::= ":" <command> { <arg> } { ";" <sysnav> }
<alias>       ::= "/" <command>
```

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

### Scoped

```
[Answer: Technical]{@src/foo.rs}
```
Attaches the behavior to a specific injected chunk. See
[docs/scoped-directives.md](scoped-directives.md).

### Wrapping form

```
[Summarize: Brief]
This is a long article about the history of computing...
[/Summarize]
```

The content between opening and closing directive is the element's input. Use the
wrapping form when multiple directives appear in sequence and inputs must not bleed.

### Standalone form

```
[Answer: Human]
What is the speed of light?
```

The directive applies to the next content block — everything that follows until the
next directive or end of message.

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

Expands to `[Commit]` before dispatch. Discovery sugar for content-affecting
directives; inherits Cue's composition and scoping once resolved.

## Malformed directives

| Input | Behavior |
|---|---|
| `[Answer Human]` | "Malformed directive — did you mean `[Answer: Human]`?" |
| `:exit` mid-sentence | Not parsed (colon is message-initial only) |
| `[Foo]` where `Foo` unregistered | "Element 'Foo' not defined" |
| `[Answer: Telepathic]` | "Tag 'Telepathic' not defined for Answer" |

## Naming rules

- **Elements:** short (1–2 syllables), verb or noun, unambiguous, no compound words.
  `Answer`, `Search`, `Code`, `Summarize`. Not `AnswerAndSearch`.
- **Tags:** adjective or noun, PascalCase, unambiguous in their element's context.
  `Human`, `Brief`, `Technical`. Not `NotFormal` (use `Casual`).
