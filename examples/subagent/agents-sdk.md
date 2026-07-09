# OpenAI Agents SDK equivalent

The Claude subagent above maps to an OpenAI Agents SDK agent with a handoff. Same
isolation model: independent context, scoped tools, summary-only return.

```python
from agents import Agent, Runner

code_reviewer = Agent(
    name="Code Reviewer",
    instructions=(
        "You are an independent code reviewer. Inspect only; do not edit. "
        "Review against main, size with git diff --stat, return a condensed "
        "summary: findings by severity, verdict, blocking items, notes."
    ),
    tools=[read_tool, grep_tool, git_diff_tool],   # scoped, no write tools
    model="gpt-5.5",
)

# Parent delegates:
result = await Runner.run(starting_agent, "review the staged changes")
# handoff to code_reviewer happens via the SDK's agent loop; only the
# summary is returned to the parent's context.
```

## Mapping to Cue

A subagent dispatch is a `class: harness` Cue directive:

```
[Agent: Switch > Reviewer]
```

resolves to the `code-reviewer` subagent, scoped to the current diff. Per
[docs/dispatch-architecture.md](../../docs/dispatch-architecture.md) it must also be
exposed as a **callable tool** so an agent can self-delegate mid-workflow — not just
via message syntax. See issue #3.
