# Cue

**A directive notation for AI agents — and a colon tier for harness navigation.**

Cue gives users a compact, readable syntax to trigger agent actions with precision,
and a clean separation between *content-affecting behavior* and *harness/UI state*.

```
[Answer: Human > Brief]{@src/foo.rs}     ← behavior, scoped to one file
:mode plan                                ← harness state, never reaches the model
/commit                                   ← alias, expands to [Commit]
```

- **Status:** Draft v0.3
- **Transport:** compatible with the `SKILL.md` / agentskills.io layout — Cue is a
  *composition and scoping layer*, not a replacement for it.
- **Reference implementation:** `src/` — a Claude Code `UserPromptSubmit` hook that
  scans, resolves, and injects Cue directives. Tested against all library elements.
- **License:** MIT

---

## The three tiers

| Tier | Syntax | Governs | Composable | Anchoring |
|---|---|---|---|---|
| **Cue** | `[Element: Tag > Tag]` | Content & behavior — model *or* harness | Yes, via `>` and `{}` | Inline, anywhere |
| **System nav** | `:command arg` | Pure harness/UI state | Chainable via `;` | Message-initial only |
| **Alias** | `/command` | Sugar that expands to a Cue | Inherits Cue's | Message-initial only |

The split is the point. `:` terminates entirely inside the harness (model never sees
it). `[...]` shapes what the model does or sees. `/` is discovery sugar.

---

## The headline feature

Every harness today has *skills* (whole-body, global) and `@`-file injection
(content, no behavior). **Cue is the only system that attaches *behavior* to a
*specific injected chunk*:**

```
[Answer: Technical]{@src/foo.rs}
[Answer: Human]{@src/bar.rs}
```

Two files, two lenses, zero ambiguity. No "applies to everything downstream."

Composition and scoping compose:

```
[Summarize: Technical > Brief]{@src/**/*.rs}
```

→ summarize every Rust file, technically, in one paragraph each.

---

## Why this exists

The fragmentation is real and widely felt: a single task like "review code" today
has five overlapping answers — a slash command, a skill, a subagent, a plugin, or
just asking. The command-vs-skill conflation is actively painful (Anthropic merged
them and users filed "bring back commands"). See [docs/rationale.md](docs/rationale.md).

Cue names one primitive — *a named action, optionally modified, optionally backed by
a definition file, dispatched by either the model or the harness* — and adds two
things no existing system has: **deterministic tag composition** and **content-scoped
behavior**.

---

## Document index

| Doc | What it covers |
|---|---|
| [docs/grammar.md](docs/grammar.md) | The full syntax, all directive forms |
| [docs/elements-and-tags.md](docs/elements-and-tags.md) | Elements, tags, the `overrides` enum, composition |
| [docs/sectional-tracing.md](docs/sectional-tracing.md) | Why dispatch cost is independent of registry size |
| [docs/scoped-directives.md](docs/scoped-directives.md) | `{@path}` / `{#id}` / `{$last}` scoping + glob + mode |
| [docs/shared-tags.md](docs/shared-tags.md) | Shared-tag includes (`[[uses]]`) |
| [docs/registry-and-discovery.md](docs/registry-and-discovery.md) | Filesystem registry, lazy discovery, `SKILL.md` compatibility |
| [docs/secrets-and-versioning.md](docs/secrets-and-versioning.md) | Secret injection, version pinning, lazy loading |
| [docs/dispatch-architecture.md](docs/dispatch-architecture.md) | The `beforeTurn` dispatcher; model never sees syntax |
| [docs/rationale.md](docs/rationale.md) | Research-grounded argument for the design |

---

## Scope discipline

Not everything is a Cue. A Cue is right when the action is repeatable, has genuine
variants, and is non-obvious. If you'd need a Cue definition shorter than the
instruction itself — just write the instruction. See the element creation checklist
in [docs/elements-and-tags.md](docs/elements-and-tags.md).

---

## Reference implementation

The `src/` directory contains a working Claude Code `UserPromptSubmit` hook:

| Module | What it does |
|---|---|
| `src/scanner.ts` | Finds `[Element: Tag]`, `{@path}`, `:command` — skips fenced code blocks |
| `src/resolver.ts` | Discovers elements, parses TOML + MD, traces sections, resolves overrides |
| `src/index.ts` | Hook entry point — reads JSON from stdin, outputs `additionalContext` |

**Run tests:** `npx tsc && node --test dist/*.test.js`

**Use as a Claude Code hook:** add to `.claude/settings.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/cue-spec/dist/index.js"
          }
        ]
      }
    ]
  }
}
```
