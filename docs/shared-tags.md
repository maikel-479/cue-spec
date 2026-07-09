# Shared Tags

Shared tags stop being a fallback and become explicit adoptions. The section content
lives in a shared file; the element references it. The tracer resolves the tag to a
byte range in the *shared* file, not the element's own body.

## Shared tag file

`~/.cue/tags/rust.md`:

```markdown
---
name: rust
overrides: ["language", "idioms", "format"]
---

## Tag: Rust
Use Rust 2021 edition idioms. Prefer `match` over chained `if let`...
```

## Element file

`~/.cue/elements/code.toml`:

```toml
[element]
name = "code"
description = "Generate executable code"

# element-specific tag — section lives in elements/code.md
[tags.review]
description = "Audit code for quality and security"
overrides = ["mode", "output"]

# adopt shared tags — section content lives in tags/*.md
[[uses]]
tag = "rust"
source = "tags/rust.md"

[[uses]]
tag = "with-tests"
source = "tags/with-tests.md"
```

## Resolution precedence (per tag, at trace time)

1. **Element-local** `## Tag: X` in `elements/code.md` → wins (specialization)
2. **Else `[[uses]]`** → trace `X` in the named shared file
3. **Else global registry fallback** → trace `X` in any registered shared tag
4. **Else** → unknown-tag error

So `[Code: rust]` traces `rust` in `tags/rust.md`; `[Code: review]` traces `review`
in `elements/code.md`. One `rust.md`, consumed by `Code`, `Review`, `Debug`.

## Why this scales

Authoring grows **linearly, not quadratically**. Without shared tags, every element
that needs a `rust` lens duplicates the Rust section. With includes, you write it
once and adopt it everywhere. Specialization is just: drop a local `## Tag: Rust` and
it shadows the shared one.

## Promotion rule

Start element-specific. Promote a tag to shared (`tags/x.md`) only once three or more
elements adopt the same tag with identical behavior. Promotion is a *move to an
include*, not a copy — the element's local section is deleted and replaced by a
`[[uses]]` entry.

## Cross-element consistency

Because the shared file is the single source of truth, a fix to `rust.md` propagates
to every adopting element on next trace (the index is invalidated by file-mtime). No
per-element drift.
