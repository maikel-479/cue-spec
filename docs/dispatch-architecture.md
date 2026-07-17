# Dispatch Architecture

The dispatcher is a single interception point at message ingress. The ideal: the
model never sees directive syntax. The reality for v2: the model *does* see the
syntax, but the resolved instructions are injected alongside it via
`additionalContext`. See [Harness capability matrix](#harness-capability-matrix) for
which harnesses achieve full syntax hiding vs. injection-only.

## Pipeline

```
stdin → [scanner] → [coalescer] → [resolver] → [substitutor] → [injector] → output
                 ↓                       ↓
            [harness router]   (class: harness → native handler; model never sees it)
```

The Coalescer and Substitutor stages are new in 1.2b. The Stripper stage (removing
directive syntax from the user message) is only achievable if the target hook can
rewrite the outgoing prompt text. As of v2, no shipped hook supports this. See
[Stripper](#stripper) below.

## Stages

### Scanner
Runs once at message ingress (the `UserPromptSubmit` hook). Finds every `[...]`
directive anywhere in the message — position-agnostic. Also checks the
message-initial character for `:` (system nav) and `/` (alias).

### Coalescer
Groups directives by **(element name, scope target)** before the Resolver runs.
Multiple occurrences of the same element with the same scope target collapse into
one directive with merged tags (left-to-right by first appearance). See
[elements-and-tags.md](elements-and-tags.md) § Same-element multi-occurrence
coalescing.

### Resolver
For each coalesced Cue directive:
1. Look up the element in the registry.
2. Resolve the merged tag chain left-to-right, tracing each tag's section via the
   [sectional-tracing mechanism](sectional-tracing.md) (header-based key, byte-offset
   index as cached derived artifact).
3. Apply `overrides` conflict resolution ([elements-and-tags.md](elements-and-tags.md)).
4. If the directive has a scope (`{...}`), resolve the referenced chunk(s)
   ([scoped-directives.md](scoped-directives.md)).
5. If `class: harness`, route to the harness handler instead of building model
   context.

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

**Claude Code implementation:** the hook's stdout (or JSON `additionalContext`)
is injected as a system reminder that Claude reads without a visible transcript
entry. The original prompt text remains unchanged — the model sees both the
directive syntax and the injected instructions.

### Stripper / Substitutor

**Status: not achievable in v2 with Claude Code.**

The Stripper stage removes `[...]` syntax from the user message before forwarding to
the model. With the `inline` field, this becomes substitution (replace with inline
text) rather than flat deletion (which would mangle sentences). If `inline` is
absent, brackets stay and `additionalContext` carries the meaning.

This requires the target hook to *rewrite* the outgoing prompt text.
Claude Code's `UserPromptSubmit` **cannot replace the prompt** — it only injects
`additionalContext` alongside the untouched original (confirmed via
[docs.anthropic.com/en/docs/claude-code/hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)):
> `UserPromptSubmit`: can't replace the prompt; it only injects `additionalContext`
> alongside it

OpenCode's equivalent hook (`chat.request.before`) is still an open, unmerged
feature request ([#19425](https://github.com/anomalyco/opencode/issues/19425)).

**v2 behavior:** the model sees the raw directive syntax in the prompt *plus* the
resolved instructions injected via `additionalContext`. This works in practice
because: (a) the injected context is authoritative and the model follows it, (b)
the directive syntax is unambiguous natural-language-like text that doesn't confuse
the model, and (c) `class: harness` directives never reach the model at all (they
short-circuit in the harness router).

**Future:** if a hook gains prompt-rewriting capability, the Substitutor activates
and hard rule #1 is fully achieved. The spec is designed so the Substitutor is a
drop-in addition, not a structural change.

### Harness router
Intercepts `class: harness` directives and runs native handlers. `[Mode: Plan]` never
touches the model.

## Hard rules

1. **The model should never see directive syntax** (aspirational, harness-dependent).
   With Claude Code's `UserPromptSubmit`, the model *does* see the syntax in v2,
   but the resolved instructions are injected via `additionalContext` and are
   authoritative. `class: harness` directives never reach the model regardless.
   Full syntax hiding requires a hook with prompt-rewriting capability.
2. **Scanner and model are independent.** A bug in Cue parsing cannot corrupt a normal
   chat, and vice versa. The `:` branch short-circuits before the Cue branch runs.
3. **Unknown is an error, never silent.** Unregistered element or tag → explicit error.

## Agent-invokability

The `:` tier is message-initial text, which means an *agent* mid-workflow cannot issue
`:mode plan` to itself the way it issues a tool. To avoid the "human-only command"
wall that plagues existing harnesses (`/reload-plugins` is human-only in several
CLIs), harness cues must also be exposed as **callable tools**, not just message
syntax. A `[Mode: Plan]` with `class: harness` should map to a `set_mode` tool the
agent can invoke. This is required for Cue to be agent-first, not human-only.

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

| Capability | Claude Code (`UserPromptSubmit`) | OpenCode (`chat.request.before`) |
|---|---|---|
| Inject `additionalContext` | Yes | Not shipped (open issue #19425) |
| Rewrite/strip prompt text | **No** | Unknown (not shipped) |
| Block prompt | Yes (exit code 2) | Unknown |
| Fire before model call | Yes | Would be, if shipped |

## Implementation sketch (Claude Code `UserPromptSubmit`)

```ts
// UserPromptSubmit hook — reads JSON from stdin, writes JSON to stdout
import { scan } from "./scanner";
import { resolve } from "./resolver";

const input = JSON.parse(await readStdin());
const msg: string = input.prompt;

// Short-circuit: colon-tier system nav
if (msg.trimStart().startsWith(":")) {
  const result = harnessRoute(msg);
  writeStdout(JSON.stringify(result));
  process.exit(0);
}

// Scan for [...], {@path}, {#id}, {$last}
const directives = scan(msg);
if (directives.length === 0) {
  process.exit(0);  // no directives, pass through unchanged
}

// Resolve each directive: registry lookup → trace → overrides → scope
const injections = directives
  .filter(d => d.element.class !== "harness")  // harness handled separately
  .map(resolve);

// Inject resolved text as additionalContext (original prompt stays intact)
writeStdout(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: injections.map(i => i.text).join("\n\n"),
  },
}));
process.exit(0);
```
