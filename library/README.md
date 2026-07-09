# Cue Library — real artifacts converted from upstream sources

These are **converted, not invented**. Each element below started as a real
prompt template, skill, or subagent fetched from an official 2026 source, then
rewritten in Cue form. The point: Cue is a *layer on top of* the existing formats,
so anything shipped as a `SKILL.md`, subagent `.md`, or prompt template can be
expressed as a Cue element — usually with sectional tracing as a free win.

| Cue element | Upstream source | Original format |
|---|---|---|
| `docx` | [anthropics/skills — `docx`](https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md) | Anthropic `SKILL.md` |
| `claude-api` | [anthropics/skills — `claude-api`](https://github.com/anthropics/skills/blob/main/skills/claude-api/SKILL.md) | Anthropic `SKILL.md` |
| `reviewer` | [Claude Code subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents) | Claude Code subagent `.md` |
| `answer` | [Anthropic Prompting best practices](https://docs.anthropic.com/en/prompt-library/prompt-library) | Reusable prompt modules |

## What conversion buys

The `docx` and `claude-api` skills are large single bodies. As Cue elements, each
natural sub-task becomes a **tag** that traces only its own `## Tag:` section:

```
[Docx: Create]        → loads only the "Creating New Documents" section
[ClaudeApi: Python]   → loads only the Python section, not Go/Java/Ruby/...
[Reviewer]{@src/x.rs} → dispatches the subagent scoped to one file
```

Dispatch cost is a function of the tag requested, not the size of the skill. See
[docs/sectional-tracing.md](../docs/sectional-tracing.md).
