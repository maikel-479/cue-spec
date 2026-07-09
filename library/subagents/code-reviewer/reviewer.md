# `reviewer` — converted from the Claude Code `code-reviewer` subagent

Source: https://docs.anthropic.com/en/docs/claude-code/sub-agents
Original: a Claude Code subagent `.md` (frontmatter `name`/`description`/`tools`/
`model` + system prompt). Converted to a Cue `class: harness` element — it is
dispatched as a subagent, never injected into the model's context.

## `reviewer.toml`

```toml
[element]
name        = "reviewer"
description = "Review code for quality and best practices. Use after writing or modifying code."
class       = "harness"
handler     = "harness::spawn_subagent"
version     = "1.0.0"
allowed-tools = "Read, Glob, Grep"

[tags.with-tests]
description = "Also check test coverage and suggest tests"
overrides   = ["scope"]
```

## `reviewer.md`

```markdown
## Default Behavior
You are a code reviewer. When invoked, analyze the code and provide specific,
actionable feedback on quality, security, and best practices. Return a prioritized
list of findings; do not rewrite the code yourself.

## Tag: With-Tests
Additionally check test coverage for touched files and suggest specific tests that
are missing.
```

## Dispatch

Because `class: harness`, this never reaches the model — the harness spawns the
subagent. Scoped form attaches the review to one file's chunk:

```
[Agent: Switch > Reviewer]{@src/auth/login.ts}
```

Per docs/dispatch-architecture.md the harness element must also be exposed as a
callable tool so an agent can self-delegate mid-workflow (issue #3).
