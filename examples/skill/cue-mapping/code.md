# Cue mapping — `code-review` skill as a Cue element

The `SKILL.md` above is a valid Cue **element** with one change: split the body into
traced `## Tag:` sections so dispatch loads only what the directive names. This is the
composition/scoping layer Cue adds on top of the skill format.

## `code.toml`

```toml
[element]
name        = "review"
description = "Review a diff or PR for bugs, security, and maintainability"
version     = "1.0.0"
allowed-tools = "Read, Grep, Glob, Bash"

[tags.brief]
description = "Top 3 findings only, one line each"
overrides   = ["length", "depth"]

[tags.security]
description = "Focus on injection, secrets, authz, deserialization"
overrides   = ["focus"]

[tags.thorough]
description = "Full checklist including maintainability and style"
overrides   = ["depth", "focus"]
```

## `code.md`

```markdown
## Default Behavior
Review the provided diff or the working tree against `main`. Return a prioritized list
of findings, not a rewrite. If clean, say so in one line. Do not invent issues.

## Tag: Brief
Report only the top 3 findings, one line each, highest severity first. Skip the
verdict paragraph unless something blocks merge.

## Tag: Security
Load references/security-checklist.md. Check only: injection, secret handling, unsafe
deserialization, authz gaps. Other findings noted but deprioritized.

## Tag: Thorough
Run the full checklist (correctness, security, maintainability) and load
references/style.md when the change touches formatted code.
```

## What Cue changes

- `[Review: security]` traces **only** the `Security` section (+ Default) and loads
  `references/security-checklist.md`. The `Brief`/`Thorough` sections are never read.
- `[Review: brief > security]` composes: `length`+`depth` → Brief, `focus` → Security.
  Leftmost wins on any shared dimension (none here → clean stack).
- `[Review: security]{@src/auth/login.ts}` scopes the review to that file's chunk.

This is the same knowledge as the `SKILL.md`, but dispatch cost is a function of the
tags requested, not the whole body. See [docs/sectional-tracing.md](../docs/sectional-tracing.md).
