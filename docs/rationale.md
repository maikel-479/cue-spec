# Rationale

Why Cue exists, and why it is shaped this way. Grounded in how real agent harnesses
actually work today.

## The fragmentation is real and widely felt

A single task — "review this code" — currently has five overlapping answers in a
modern coding agent: a slash command, a skill, a subagent, a plugin, or just asking.
They vary only along (a) where the prompt is installed and (b) which context it runs
in. Practitioners consistently ask for consolidation, and a Claude Code team member
publicly agreed: *"we're working on consolidating these."*

## The command/behavior collision is actively painful

Anthropic merged slash commands and skills into one concept. Users pushed back hard —
filing "bring back Commands," arguing that commands (user-invoked, deterministic) and
skills (agent-invoked, knowledge) are conceptually distinct and that erasing the
distinction muddied the semantics. The conflation produced exactly the problem Cue's
`;`/`:`/ `[...]` tiers solve: `:` is harness nav (user-driven, terminates in harness),
`[...]` is content/behavior (model or harness, composable). The split is the single
most-supported idea in the discourse.

## Progressive disclosure is the consensus win

Every modern harness — OpenCode, Cursor, Claude Code, Codex — loads only a skill's
name+description at startup and pulls the full body on activation. This validates the
*principle* behind sectional tracing. But none traces *within* a single skill body:
invoking one language tag still loads the whole multi-language skill. Sectional
tracing fixes that sub-granularity.

## The real, current pain is discovery overload

The consensus win has a dark side: a harness that scans every skill directory
recursively pulls 100K+ tokens into context at session start, including other agents'
hidden folders. This is a documented, reported failure. It dictates Cue's hard
requirement: **lazy discovery by default.** Eager scanning is how skill systems die in
production.

## Composition is wanted; nobody has it

Practitioners ask for skills that compose — meta-skills calling smaller skills. The
`overrides`-based tag composition (`[Answer: Human > Brief]`) is the concrete
mechanism, and it is genuinely novel: no existing system resolves composed behavior
deterministically. Under slash commands, every combination is a separately-authored
string.

## The differentiator is scoped behavior

Every harness has skills (whole-body, global) and `@`-file injection (content, no
behavior). **No harness attaches behavior to a specific injected chunk.** That is
Cue's wedge: `[Answer: Technical]{@src/foo.rs}`. Not "skills with composition" — but
"behavior scoped to content." This is what practitioners cannot do today and what
justifies the project.

## Position as a layer, not a replacement

The agent ecosystem is fragmenting around skill folders (`.claude`, `.codex`,
`.opencode`, `.agents`). Proposing a fourth registry format would be the "15th
standard" trap. Cue is deliberately a **composition and scoping layer on top of the
existing `SKILL.md` layout** — extending what exists rather than replacing it. This
converts potential opponents (harness maintainers, standards skeptics) into adopters.

## Three primitives the spec must not omit

From real practitioner reports:
- **Secret injection** — skill authors distributing to non-technical clients have no
  clean way to set up credentials.
- **Versioning** — "we keep standardising without adding versioning."
- **Lazy loading** — the documented context blowup from recursive scanning.

These are requirements, not extensions.

## What Cue is, stated once

A named action, optionally modified, optionally backed by a definition file,
dispatched by either the model or the harness — is the only primitive that exists
here. Slash commands, skills, MCP tools, and system commands are not four different
things. They are one thing, described four ways, by teams who never compared notes.
Cue names the primitive, makes composition deterministic, scopes behavior to content,
and does it as a layer on the standard the ecosystem is already converging on.
