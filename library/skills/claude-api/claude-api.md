# `claude-api` — converted from the Anthropic `claude-api` skill

Source: https://github.com/anthropics/skills/blob/main/skills/claude-api/SKILL.md
Original: a very large `SKILL.md` with per-language sections. Converted so each
language is a traced tag — the flagship sectional-tracing case from the spec.

## `claude-api.toml`

```toml
[element]
name        = "claude-api"
description = "Build, debug, and optimize Claude API / Anthropic SDK apps"
version     = "1.0.0"
allowed-tools = "Read, Write, Edit, Bash, WebFetch"

[tags.python]
description = "Python SDK (anthropic)"
overrides   = ["language", "sdk"]

[tags.typescript]
description = "TypeScript SDK (@anthropic-ai/sdk)"
overrides   = ["language", "sdk"]

[tags.go]
description = "Go SDK (anthropic-sdk-go)"
overrides   = ["language", "sdk"]

[tags.ruby]
description = "Ruby SDK (anthropic)"
overrides   = ["language", "sdk"]

[tags.curl]
description = "Raw HTTP / curl"
overrides   = ["language", "sdk"]

[tags.migrate]
description = "Migrate existing Claude API code to a newer model"
overrides   = ["mode"]
```

## `claude-api.md`

```markdown
## Default Behavior
Before You Start: scan the target file for non-Anthropic provider markers
(`import openai`, `langchain_openai`, `gpt-4/5`, `*-generic.py`). If found, stop and
tell the user this skill produces Claude/Anthropic SDK code; ask whether to switch.
Do NOT edit a non-Anthropic file with Anthropic SDK calls.

Output Requirement: when adding/modifying a Claude feature, call Claude via (1) the
official SDK for the project's language, or (2) raw HTTP only when the user asks.
Never mix the two. Never guess SDK usage — function names, signatures, import paths
must come from the skill's `{lang}/` files or official docs. If WebFetch fails,
compile-fix against local errors instead of retrying network research.

Defaults: use `claude-opus-4-8` unless the user names another model. Use adaptive
thinking (`thinking: {type: "adaptive"}`) for anything non-trivial. Default to
streaming for long input/output to avoid timeouts.

API Drift: several shapes changed in 2025–2026. The `{lang}/` files are authoritative
over recalled patterns.

## Tag: Python
Use `from anthropic import Anthropic`. Tool runner: `@beta_tool` decorator +
`client.beta.messages.tool_runner(...)`. Structured output: `client.messages.parse()`.
Adaptive thinking on; `budget_tokens` is deprecated (400 on Opus 4.7+/Fable 5).
Streaming via `client.beta.messages.stream(...)`.

## Tag: TypeScript
Use `@anthropic-ai/sdk`. Tool runner: `betaZodTool` + `client.beta.messages.toolRunner`.
Adaptive thinking on.

## Tag: Go
Use `anthropic.NewClient(ctx, ...)`. Tool runner: `toolrunner.NewBetaToolFromJSONSchema`
+ `client.Beta.Messages.NewToolRunner`. Code execution beta lives under
`client.Beta.Messages.New`.

## Tag: Ruby
Use `Anthropic::Client.new`. Tool runner: `Anthropic::BaseTool` subclass +
`client.beta.messages.tool_runner`.

## Tag: Curl
Raw HTTP. When `ANTHROPIC_API_KEY` is unset, run `ant auth print-credentials
--access-token` and send `Authorization: Bearer <token>` + header
`anthropic-beta: oauth-2025-04-20`. Never put the key in `x-api-key:` for OAuth tokens.

## Tag: Migrate
Read `shared/model-migration.md` and follow in order: Step 0 confirm scope (ask which
files/dirs before any edit), Step 1 classify each file, then the per-target
breaking-changes section. Do not summarize the guide — execute it. If the user did
not name a target model, ask in the same turn as the scope question.
```

Usage:
```
[ClaudeApi: Python]        → loads only the Python section
[ClaudeApi: Python > Migrate] → Python + migration guidance, no other languages
```
