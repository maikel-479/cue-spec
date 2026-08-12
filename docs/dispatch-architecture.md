# Dispatch Architecture

The dispatcher is a single interception point at message ingress. The ideal: the
model never sees directive syntax. The reality: the model *may* see the syntax, but
the resolved instructions are injected alongside it via `additionalContext`. Full
syntax hiding requires a hook with prompt-rewriting capability.

## Pipeline

```
stdin → [alias-expander] → [scanner] → [coalescer] → [resolver] → [substitutor] → [injector] → output
                          ↓              ↓                       ↓                       ↓
                    [alias table]  [harness router]   (scope-only → passive inject)  (class: harness → native handler)
```

Each stage has a single responsibility. Changes to one stage don't cascade.
The alias expander runs first, turning `/name` shortcuts into full Cue
directives. The scanner then processes both cue and scope-only items. The
coalescer only groups cues; the resolver handles both paths.

## Stages

### Alias expander
Runs at message ingress, before the scanner. Checks message-initial `/command`
forms against the alias table (loaded from `~/.pi/aliases.toml` or project
`cue.toml`). Replaces each alias with its target Cue directive.

The alias table maps short names to full Cue expressions:

```toml
# ~/.pi/aliases.toml
commit = "[Commit]{@git, tone: concise}"
review = "[Review: Technical]{@code, depth: high}"
```

Expansion is pure string substitution — no Cue semantics are evaluated at this
stage. The scanner receives the expanded text and processes it like any other
input.

If an alias is unregistered, the expander reports an error and stops.

### Scanner
Runs once at message ingress (the pre-model-call hook). Finds every `[...]`
directive and every `{...}` scope anywhere in the message — position-agnostic.
Also checks the message-initial character for `:` (system nav).

The scanner produces two kinds of parsed items:
- **Cues:** `[Element: Tag]{@scope}` — behavioral directives with optional scope
- **Scope-only:** `{@path}`, `{#id}`, `{$last}` — standalone content references

### Coalescer
For cues: groups by **(element name, scope target)** before the Resolver runs.
Multiple occurrences of the same element with the same scope target collapse into
one directive with merged tags (left-to-right by first appearance). See
[elements-and-tags.md](elements-and-tags.md) § Same-element multi-occurrence
coalescing.

Scope-only directives do not coalesce — each `{@file}` is an independent injection.

### Resolver
For each parsed item:

**Cue directives:**
1. Look up the element in the registry.
2. Resolve the merged tag chain left-to-right, tracing each tag's section via the
   [sectional-tracing mechanism](sectional-tracing.md) (header-based key, byte-offset
   index as cached derived artifact).
3. Apply `overrides` conflict resolution ([elements-and-tags.md](elements-and-tags.md)).
4. If the directive has a scope (`{...}`), resolve the referenced chunk(s)
   ([scoped-directives.md](scoped-directives.md)).
5. If `class: harness`, route to the harness handler instead of building model
   context.

**Scope-only directives:**
1. Resolve the referenced content (read file, expand glob, resolve id, or fetch
   last result).
2. Inject as passive context — no behavioral framing applied.

### Substitutor
If the harness supports prompt rewriting, replaces `[Element: Tags]` syntax in the
user message with the tag's `inline` field text. If any tag in a composed chain
lacks `inline`, the chain is left unsubstituted. See
[elements-and-tags.md](elements-and-tags.md) § The `inline` field.

If the harness cannot rewrite prompts, this stage is a no-op — brackets stay visible
and `additionalContext` carries the meaning.

### Injector
Attaches the resolved, traced text to the model's context — as a system/augmentation
block via `additionalContext`. If the directive was scoped, the text attaches to the
referenced chunk's slot, not globally.

### Harness router
Intercepts `class: harness` directives and runs native handlers. `[Mode: Plan]` never
touches the model.

## Skill + Cue integration

Skills and cues are orthogonal concerns that compose:

| Concern | Defines | Example |
|---|---|---|
| **Skill** | What the agent can do | `commit` skill provides git tools and instructions |
| **Cue** | How the agent behaves | `[Commit]{@git, tone: concise}` constrains output style |

The dispatcher resolves both independently:
1. **Skills** are discovered from `~/.agents/skills/` (Pi's existing discovery)
2. **Cues** are resolved from the active cue directives (Cue layer adds this)
3. **Both** are injected into the system prompt — skills give capabilities,
   cues give behavioral constraints

Aliases bridge the two. An alias maps a short `/name` to a full Cue directive
that specifies both the element (which may correlate with a skill) and the
behavioral constraints:

```toml
# Alias binds skill capability to cue behavior
commit = "[Commit]{@git, tone: concise}"
#     ↑ element name        ↑ scope + behavioral tags
```

When `/commit` expands:
- The `commit` skill provides git tools and commit instructions
- The `[Commit]` cue constrains the output style (concise, conventional)
- The `@git` scope limits the cue to git-related context

They don't replace each other. A skill without cues still works — it just
uses defaults. A cue without skills is behavioral instructions with no
capabilities to constrain.

## Hard rules

1. **The model should never see directive syntax** (aspirational, harness-dependent).
   Full syntax hiding requires a hook with prompt-rewriting capability. When
   unavailable, the resolved instructions are injected via `additionalContext` and are
   authoritative. `class: harness` directives never reach the model regardless.
2. **Scanner and model are independent.** A bug in Cue parsing cannot corrupt a normal
   chat, and vice versa. The `:` branch short-circuits before the Cue branch runs.
3. **Unknown is an error, never silent.** Unregistered element or tag → explicit error.

## Context budget management

Cue injections consume context window space. A dispatcher must account for this:

### The problem

A user typing `[Answer: Technical]{@src/**/*.rs}` with 50 Rust files will silently
blow past the context window. The injector has no token awareness.

### The solution

The dispatcher should implement a **context budget manager** that:

1. Estimates token count of each injection (heuristic: ~4 chars/token for English)
2. Prioritizes injections by specificity (scoped > unscoped) and recency
3. Compresses or truncates when budget is exceeded
4. Reports context pressure to the user (e.g., "Cue injections using 12K of 200K
   tokens")

### Priority ordering

When the budget is tight, the dispatcher should accept or defer injections in this
order:

1. **Scoped directives** (highest priority — specific to the current task)
2. **Unscoped directives with tags** (behavioral framing)
3. **Unscoped directives without tags** (default behavior, lowest priority)

### Implementation

```
buildAdditionalContext()
    → ContextBudgetManager.allocate(injections, budget)
        → prioritize by: scope specificity × recency
        → compress low-priority injections (summarize, truncate)
        → return { accepted: Injection[], deferred: Injection[], stats }
```

Deferred injections should be surfaced to the user so they know what was skipped.

## Turn-level lifecycle

The dispatcher should not be a one-shot pre-flight interceptor. It should hook into
the agent's **turn lifecycle** to re-evaluate active directives each turn:

| Hook | When | What Cue does |
|---|---|---|
| `beforeTurn` | Before each LLM call | Re-evaluate active cues, refresh `{@file}` if changed, measure context pressure |
| `afterTurn` | After tool results | Update `{$last}` reference, track cost per turn |
| `onCompaction` | When context is compacted | Clear active cues (per design decision: cues are cheap to re-apply) |

This makes Cue turn-aware and responsive to the agent lifecycle, rather than a
static pre-processor.

## Agent-invokability

The `:` tier is message-initial text, which means an *agent* mid-workflow cannot issue
`:mode plan` to itself the way it issues a tool. To avoid the "human-only command"
wall that plagues existing harnesses, harness cues must also be exposed as **callable
tools**, not just message syntax.

### Dual-surface pattern

Every `class: harness` element ships **two** invocation surfaces:

| Surface | Example | Who uses it |
|---|---|---|
| Colon syntax (message-initial) | `:mode plan` | Human typing in the prompt |
| Callable tool | `set_mode(mode: "plan")` | Agent mid-workflow via tool use |

Both reach the same harness handler. The colon syntax is sugar; the tool schema is
the programmatic interface.

### Worked example: `[Mode: Plan]`

**As colon syntax:**
```
:mode plan
```

**As a callable tool (schema the agent sees):**
```json
{
  "name": "set_mode",
  "description": "Switch the harness execution mode",
  "input_schema": {
    "type": "object",
    "properties": {
      "mode": {
        "type": "string",
        "enum": ["plan", "act", "review"],
        "description": "The execution mode to activate"
      }
    },
    "required": ["mode"]
  }
}
```

The agent invokes `set_mode(mode: "plan")` via its tool-use mechanism. The harness
router intercepts it, applies the mode change, and the model never sees directive
syntax — same outcome as `:mode plan`, different entry point.

### Registration requirement

Every harness element's `.toml` must declare both surfaces:

```toml
[element]
name    = "mode"
class   = "harness"
handler = "harness::set_mode"
# tool schema is derived from the handler's parameter spec
```

## Harness capability matrix

| Capability | Pre-model-call hook (e.g. UserPromptSubmit) | Prompt-rewriting hook |
|---|---|---|
| Inject `additionalContext` | Yes | Yes |
| Rewrite/strip prompt text | **No** | Yes |
| Block prompt | Yes (exit code 2) | Yes |
| Fire before model call | Yes | Yes |

**v2 behavior with injection-only hooks:** the model sees the raw directive syntax in
the prompt *plus* the resolved instructions injected via `additionalContext`. This
works in practice because: (a) the injected context is authoritative and the model
follows it, (b) the directive syntax is unambiguous natural-language-like text that
doesn't confuse the model, and (c) `class: harness` directives never reach the model
at all (they short-circuit in the harness router).

**Future:** if a hook gains prompt-rewriting capability, the Substitutor activates
and hard rule #1 is fully achieved. The spec is designed so the Substitutor is a
drop-in addition, not a structural change.

## Graph-based turn execution

The dispatch pipeline should be modeled as explicit state transitions, not a
monolithic input interceptor. This makes each stage independently testable and
auditable.

### Conceptual state graph

```
[idle] → (user_input) → [cue_resolve] → [context_build] → [llm_call]
  ↑                                                              ↓
  ← ← ← ← ← ← ← ← ← [tool_execute] ← ← ← ← ← ← ← ← ← ← ←
                           ↓
                    [eval_check] → (pass) → [idle]
                           ↓ (fail/rewrite)
                    [context_adjust] → [llm_call]
```

Each node is a pure function with explicit inputs and outputs. Transitions are
declarative. This is the difference between a 792-line while loop and a composable
graph where each node can be tested independently.

### Why this matters

- **Auditability:** every decision point is a named node, not a scattered `if` in a
  loop
- **Testability:** each node can be unit-tested with synthetic inputs
- **Composability:** new stages (eval, budget check, re-planning) are new nodes, not
  modifications to a loop body
- **Recovery:** checkpointing at each node enables resume-after-failure

The agent loop implementation should follow this pattern. The Cue dispatcher is one
node (`cue_resolve`) in a larger graph.
