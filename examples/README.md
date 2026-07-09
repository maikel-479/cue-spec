# Examples — A reusable 2026 agent harness blueprint

These examples instantiate the three-layer structure the 2026 sources converge on:

| Layer | Source format | Cue mapping |
|---|---|---|
| **Prompt template** | Anthropic XML + OpenAI outcome-first | element *default behavior* |
| **Skill** | Anthropic/Codex `SKILL.md` | a Cue **element** (`.toml` + `.md`) |
| **Subagent** | Claude subagent `.md` / OpenAI Agents SDK handoff | `class: harness` dispatch to a subagent |

Read in order: [01-prompt-template.md](01-prompt-template.md) →
[skill/SKILL.md](skill/SKILL.md) (+ [skill/cue-mapping](skill/cue-mapping)) →
[subagent/code-reviewer.md](subagent/code-reviewer.md).

The point: Cue is a **composition and scoping layer on top of the skill format**,
not a replacement. The skill below is valid `SKILL.md` *and* a valid Cue element.
