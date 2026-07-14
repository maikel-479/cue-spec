# Dispatch Architecture

The dispatcher is a single interception point at message ingress. The model never
sees directive syntax.

## Pipeline

```
stdin → [scanner] → [resolver] → [injector] → [stripped message → model]
                 ↓
            [harness router]   (class: harness → native handler; model never sees it)
```

## Stages

### Scanner
Runs once at message ingress (the `beforeTurn` hook). Finds every `[...]` directive
anywhere in the message — position-agnostic. Also checks the message-initial
character for `:` (system nav) and `/` (alias).

### Resolver
For each Cue directive:
1. Look up the element in the registry.
2. Resolve the tag chain left-to-right, tracing each tag's section via the
   [sectional-tracing mechanism](sectional-tracing.md) (header-based key, byte-offset
   index as cached derived artifact).
3. Apply `overrides` conflict resolution ([elements-and-tags.md](elements-and-tags.md)).
4. If the directive has a scope (`{...}`), resolve the referenced chunk(s)
   ([scoped-directives.md](scoped-directives.md)).
5. If `class: harness`, route to the harness handler instead of building model
   context.

### Injector
Attaches the resolved, traced text to the model's context — as a system/augmentation
block. If the directive was scoped, the text attaches to the referenced chunk's slot,
not globally.

### Stripper
Removes the `[...]` (and `:` / `/`) syntax from the user message before forwarding to
the model. The model sees only clean natural language plus the compiled instructions.

### Harness router
Intercepts `class: harness` directives and runs native handlers. `[Mode: Plan]` never
touches the model.

## Hard rules

1. **The model never sees directive syntax.** This keeps Cue scalable: the model is
   ignorant of Cue, so Cue can grow arbitrarily complex at zero model-comprehension
   cost. The harness compiles it away.
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

## Implementation sketch (OpenCode-style hook)

```ts
// beforeTurn hook
export async function beforeTurn(msg: string): Promise<DispatchResult> {
  if (msg.trimStart().startsWith(":")) {
    return harnessRoute(msg);          // short-circuit, model never called
  }
  const directives = scan(msg);        // find all [...]
  if (directives.length === 0) {
    return { message: msg, context: [] };
  }
  const injections = directives.map(resolve);   // trace + compose
  return {
    message: strip(msg, directives),            // clean natural language
    context: injections,                        // attached to model
  };
}
```
