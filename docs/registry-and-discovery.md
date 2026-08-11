# Registry and Discovery

The registry is the filesystem. `cue.toml` is optional metadata, not a manifest you
must hand-edit for every addition.

## Filesystem as registry

```
~/.cue/
├── cue.toml              ← optional: overrides, global tags, settings
├── elements/
│   ├── answer.toml       ← element definition (tags + overrides)
│   ├── answer.md         ← element body (## Tag: sections, traced)
│   ├── code.toml
│   └── code.md
└── tags/
    ├── rust.md           ← shared tag (adopted via [[uses]])
    └── with-tests.md
```

Adding an element = drop a `.toml` + `.md` pair. The scanner discovers it by
directory scan. No central file to edit, no merge-conflict-prone manifest.

## Discovery roots

Load elements from these paths (in order):

1. `~/.cue/elements/` — user-global, shared across projects
2. `~/.cue/tags/` — user-global shared tags
3. `<project>/.cue/elements/` — project-specific (if the harness supports project roots)
4. `<project>/.cue/tags/` — project-specific shared tags

Harness-specific elements (`Mode`, `Status`, `Cost`) live in project root. Content
elements (`Answer`, `Review`) live globally. Closer scope wins on name conflicts.

## Lazy discovery (required)

Discovery is **lazy by default**. The dispatcher loads only the `name` + `description`
of each element (and each tag) at startup — the same progressive-disclosure principle
every modern harness uses for skills. The full body is traced on dispatch only.

This is not optional. Eager discovery of a large registry recreates the documented
failure: a harness that scans every skill directory recursively and pulls 100K+ tokens
into context at session start (a real, reported Cursor bug). Cue must never do that.

Discovery rules:
- Load frontmatter/name+description only at startup.
- Do **not** recurse into hidden subdirectories of other agents.
- Deduplicate by normalized name across roots.
- Build the section index lazily, invalidated by file-mtime.

## `cue.toml` (optional)

Used for global tags, settings, and overrides — not for element registration.

```toml
[cue]
version = "0.4.0"

[[tags]]
name = "Brief"
description = "Constrain output length. One paragraph or equivalent."
source = "tags/brief.md"

[aliases]
commit = "[Commit]"
explain = "[Explain: Technical]"
review = "[Review]"
test = "[Test]"
```

## `SKILL.md` compatibility

Cue is a **composition and scoping layer on top of the existing `SKILL.md` /
agentskills.io layout**, not a replacement for it.

- An element's `.md` body *is* a skill body. It can live at `.claude/skills/...`,
  `.opencode/skills/...`, `.cursor/rules/...`, or any harness's skill folder and be
  discovered by those harnesses too.
- Each `## Tag: X` section maps to a sub-capability of that skill.
- The Cue dispatcher adds two things the standard skill loader lacks: sectional
  tracing (load only the invoked section) and content scoping (`{@path}`).

Positioning Cue as compatible — not competing — with agentskills.io is deliberate.
The agent ecosystem is already fragmenting around skill folders (`.claude`, `.codex`,
`.opencode`, `.cursor`, `.agents`); proposing a fourth registry format would be the
"15th standard" trap. Cue extends what exists.

## Validation

At index-build time, the harness lints frontmatter against markdown bodies —
described canonically in [sectional-tracing.md](sectional-tracing.md#validation).
Every `[tags.*]` must have a matching `## Tag:` subtitle, and every `## Tag:`
subtitle must correspond to a declared tag. Mismatches are build-time warnings,
surfaced to the user — never silent gaps.
