# Cue Agent — Implementation Plan

Build a Cue dispatcher as a Pi agent fork. The dispatcher intercepts user input
before each LLM call, resolves Cue directives, and injects behavioral context
into the model's prompt.

## Goal

A working Cue agent where users can type:

```
{@src/config.rs}                            ← passive context injection
[Answer: Technical]{@src/foo.rs}             ← behavior + scope
:mode plan                                   ← harness state (model never sees it)
/commit                                      ← alias expands to [Commit]
```

And the model receives the resolved behavioral framing and content, while
harness commands are handled natively.

## Architecture

```
user input
  ↓
Pi command parser (built-ins: /help, /compact, etc.)
  ↓ (not consumed)
beforeTurn hook
  ↓
cue-core dispatcher:
  1. alias-expander   →  /commit → [Commit]{@git, tone: concise}
  2. scanner          →  finds [...], {/@}, :commands
  3. coalescer        →  groups same-element+same-scope, dedupes scopes
  4. resolver         →  traces sections, resolves tags, applies overrides
  5. injector         →  builds augmentation block, prepends to messages
  ↓
model call (sees augmentation + user message)
  ↓
afterTurn hook → captures {$last}, tracks cost
  ↓
onCompaction hook → clears active cues
```

## Resolved decisions

| Decision | Resolution |
|---|---|
| Hook surface | `beforeTurn`/`afterTurn`/`onCompaction` added to agent loop (~6 lines) |
| Injection mechanism | Hidden system-level message, prepended before user message |
| Registry coexistence | Parallel: Pi skills in `~/.agents/skills/`, Cue elements in `~/.cue/elements/` |
| Tool generation | `cue-core` parses `.toml`, derives JSON Schema, registers via `extension.tools.register()` |
| Colon tier | Stripped in `beforeTurn` before model sees it |
| Lifecycle hooks | Named hooks in agent loop, registration-order chaining |
| `{$last}` | Removed from v1, deferred to v2 |
| Token budget | Heuristic `chars / 4` for v1 |
| Sectional tracing | New module in `cue-core`, file watching + byte-offset index |
| Scope injection | `{@file}` routes through augmentation block, not user message |
| `inline` substitution | Deferred — model sees raw syntax + injected instructions |
| Slash commands | Built-ins first, aliases second |
| `{#id}` marks | Removed from v1 — broken for pasted content in terminal harnesses |
| Persistence | Per-turn default, explicit `:default` for session-level |
| Transform scope | Required — error without it |
| Deduplication | Content-hash dedupe in coalescer |
| Package boundary | `cue-core` depends on `ai` + `node` only, pure function API |
| `beforeTurn` contract | Mutate messages in place, registration-order chaining |
| Testing | Unit tests for cue-core, integration tests in Pi suite |

## Package structure

```
packages/
  cue-core/                          ← NEW: Cue dispatcher
    src/
      index.ts                       ← public API: dispatch(), types
      scanner.ts                     ← finds [...], {/@}, :commands
      coalescer.ts                   ← groups cues, dedupes scopes
      resolver.ts                    ← element registry, tag composition, overrides
      injector.ts                    ← builds augmentation block
      tracer.ts                      ← sectional tracing (byte-offset index)
      tool-generator.ts              ← class: harness → tool schema
      budget.ts                      ← context budget manager
      types.ts                       ← shared types
    test/
      scanner.test.ts
      coalescer.test.ts
      resolver.test.ts
      injector.test.ts
      tracer.test.ts
      budget.test.ts
      dispatch.test.ts               ← integration: full pipeline
    package.json
    tsconfig.json
    tsconfig.build.json
```

## Implementation phases

### Phase 1: cue-core foundation

Build the dispatcher as a pure package with no Pi dependency.

#### 1.1 Types and scanner

**File: `packages/cue-core/src/types.ts`**

```typescript
export type ElementClass = "model" | "harness" | "transform";

export interface CueElement {
  name: string;
  description: string;
  version: string;
  class: ElementClass;
  allowedTools?: string;
  handler?: string;
  inputs?: string[];
  tags: Record<string, TagDef>;
  uses?: UseEntry[];
}

export interface TagDef {
  description: string;
  overrides: string[];
  exclusive?: boolean;
  inline?: string;
}

export interface UseEntry {
  tag: string;
  source: string;
}

export type Statement =
  | { kind: "cue"; element: string; tags: string[]; scope?: ScopeRef }
  | { kind: "scope-only"; scope: ScopeRef }
  | { kind: "sysnav"; command: string; args: string[] }
  | { kind: "alias"; name: string };

export interface ScopeRef {
  type: "file" | "glob";
  value: string;
  lineRange?: { start?: number; end?: number };
}

export interface ResolvedCue {
  element: CueElement;
  resolvedTags: ResolvedTag[];
  scope?: ScopeRef;
  defaultBehavior: string;
  tagSections: string[];
}

export interface ResolvedTag {
  name: string;
  overrides: string[];
  exclusive: boolean;
  section: string;
  inline?: string;
}

export interface DispatchResult {
  augmentation: string;       // text to inject as system context
  harnessCommands: HarnessCommand[];
  errors: string[];
  warnings: string[];
  stats: {
    cuesResolved: number;
    scopesInjected: number;
    tokensEstimated: number;
  };
}

export interface HarnessCommand {
  handler: string;
  args: Record<string, unknown>;
}

export interface SessionState {
  lastToolResult?: unknown;
  activeDefaults: Map<string, string>;  // element → tag chain
}
```

**File: `packages/cue-core/src/scanner.ts`**

Responsibilities:
- Find all `[Element: Tag]{@scope}` directives anywhere in message
- Find all standalone `{@scope}` scope-only statements
- Check message-initial character for `:` (sysnav) and `/` (alias)
- Skip fenced code blocks (``` and ~~~) and inline code spans
- Return array of `Statement` objects

Key implementation detail: the exclusion zone scanner must track nesting of
backtick fences and tild fences independently. Inline code spans are single
backtick pairs that don't cross lines.

#### 1.2 Coalescer

**File: `packages/cue-core/src/coalescer.ts`**

Responsibilities:
- Group cue directives by (element name, scope target)
- Merge tags left-to-right by first appearance
- Dedupe scope-only directives by content hash (hash resolved content, not path)
- Preserve ordering: cues in message order, scope-only in message order

```typescript
export function coalesce(statements: Statement[]): Statement[];
```

#### 1.3 Resolver

**File: `packages/cue-core/src/resolver.ts`**

Responsibilities:
- Look up element in registry
- Resolve tag chain left-to-right via sectional tracing
- Apply `overrides` conflict resolution (leftmost wins per dimension)
- Validate: unknown element → error, unknown tag → error
- Validate: transform without scope → error
- Return `ResolvedCue` with traced sections

```typescript
export function resolve(
  cue: Extract<Statement, { kind: "cue" }>,
  registry: ElementRegistry,
  session: SessionState,
): ResolvedCue;
```

#### 1.4 Injector

**File: `packages/cue-core/src/injector.ts`**

Responsibilities:
- Build augmentation block text from resolved cues and scope-only injections
- Format as system-level message content
- Handle scope-only: inject file content as passive context
- Handle scoped cue: attach behavioral framing to content chunk
- Handle unscoped cue: inject as global behavioral context

```typescript
export function inject(
  resolved: ResolvedCue[],
  scopeOnly: ScopeOnlyInjection[],
  budget: BudgetResult,
): string;
```

#### 1.5 Sectional tracer

**File: `packages/cue-core/src/tracer.ts`**

Responsibilities:
- Build section index from element `.md` body (scan `## Tag:` headers)
- Map each tag name to byte-offset range
- Cache index, invalidate on file mtime
- Extract byte range at dispatch time
- Handle shared tags via `[[uses]]` resolution
- Validation: every declared tag must have `## Tag:` section, and vice versa

Data structure:

```typescript
interface SectionIndex {
  elementName: string;
  filePath: string;
  mtime: number;
  sections: Map<string, { start: number; end: number }>;
  defaultBehavior: { start: number; end: number };
}
```

Resolution precedence per tag:
1. Element-local `## Tag: X` in element's `.md`
2. Else `[[uses]]` → trace in named shared file
3. Else global registry fallback
4. Else → unknown-tag error

#### 1.6 Budget manager

**File: `packages/cue-core/src/budget.ts`**

Responsibilities:
- Estimate token count of each injection (`chars / 4`)
- Prioritize: scoped > unscoped+tags > unscoped
- Compress or defer when budget exceeded
- Return accepted/deferred lists + stats

```typescript
export interface BudgetInput {
  injections: Injection[];
  budget: number;  // estimated token budget
}

export interface BudgetResult {
  accepted: Injection[];
  deferred: Injection[];
  stats: { totalTokens: number; deferredTokens: number };
}

export function allocateBudget(input: BudgetInput): BudgetResult;
```

#### 1.7 Tool generator

**File: `packages/cue-core/src/tool-generator.ts`**

Responsibilities:
- Scan element registry for `class: harness` elements
- Parse handler field to derive parameter spec
- Generate JSON Schema for each harness element
- Return tool definitions ready for Pi's `extension.tools.register()`

```typescript
export interface CueToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: string;
}

export function generateTools(registry: ElementRegistry): CueToolDefinition[];
```

#### 1.8 Public API

**File: `packages/cue-core/src/index.ts`**

```typescript
export function dispatch(
  messages: Message[],
  registry: ElementRegistry,
  session: SessionState,
  options: DispatchOptions,
): DispatchResult;

// Also export types, but NOT internal modules
export type {
  CueElement,
  TagDef,
  Statement,
  ResolvedCue,
  DispatchResult,
  SessionState,
  DispatchOptions,
};
```

`dispatch()` is the entire pipeline: scan → coalesce → resolve → budget → inject.
It mutates `messages` in place, prepending the augmentation block.

### Phase 2: Element registry and filesystem

#### 2.1 Element discovery

**File: `packages/cue-core/src/registry.ts`**

Responsibilities:
- Scan `~/.cue/elements/` for `.toml` + `.md` pairs
- Parse TOML frontmatter into `CueElement`
- Build section indexes lazily (on first dispatch of each element)
- Cache in memory, invalidate on mtime
- Handle `[[includes]]` for shared tags from `~/.cue/tags/`

Discovery roots (in order):
1. `~/.cue/elements/` — user-global
2. `~/.cue/tags/` — user-global shared tags
3. `<project>/.cue/elements/` — project-specific
4. `<project>/.cue/tags/` — project-specific shared tags

#### 2.2 Alias config

**File: `packages/cue-core/src/aliases.ts`**

Responsibilities:
- Load alias table from `~/.pi/aliases.toml` or project `cue.toml`
- Map short names to full Cue expressions
- Validate alias targets (element must exist)
- Expand aliases before scanner runs

```typescript
export interface AliasTable {
  aliases: Map<string, string>;  // name → cue expression string
}

export function loadAliases(configPaths: string[]): AliasTable;
export function expandAlias(name: string, table: AliasTable): string | null;
```

### Phase 3: Pi integration

#### 3.1 Agent loop hooks

**File to modify: `packages/agent/src/index.ts` (or wherever the agent loop lives)**

Add three hook points to the agent loop:

```typescript
// Before the while loop:
const beforeTurnHooks: Array<(messages: Message[], session: Session) => void> = [];
const afterTurnHooks: Array<(call: ToolCall, result: ToolResult) => void> = [];
const onCompactionHooks: Array<() => void> = [];

// Inside the loop, before callModel:
for (const hook of beforeTurnHooks) {
  hook(messages, session);
}

// Inside tool execution:
for (const hook of afterTurnHooks) {
  hook(call, result);
}

// When compaction fires:
for (const hook of onCompactionHooks) {
  hook();
}
```

~6 lines of change in the agent loop.

#### 3.2 Hook registration

**File: `packages/cue-core/src/pi-integration.ts`** (or similar)

Wire cue-core into Pi's hook system:

```typescript
export function registerCueHooks(
  agent: AgentCore,
  registry: ElementRegistry,
  config: CueConfig,
): void {
  // beforeTurn: run dispatcher
  agent.hooks.beforeTurn.register("cue-dispatcher", (messages, session) => {
    const result = dispatch(messages, registry, session, config);
    // Log warnings/errors
    // Update session state
  });

  // afterTurn: track cost
  agent.hooks.afterTurn.register("cue-capture", (call, result) => {
    // Track turn cost
  });

  // onCompaction: clear active cues
  agent.hooks.onCompaction.register("cue-clear", () => {
    session.activeDefaults.clear();
  });
}
```

#### 3.3 Built-in command precedence

Pi's command parser runs before the `beforeTurn` hook. If a message is
consumed by a built-in command (`/help`, `/compact`, etc.), the hook never
fires. This is the natural precedence — no special handling needed.

If a user defines an alias with the same name as a built-in, warn at load
time and skip the alias.

#### 3.4 Tool registration for harness elements

At startup, after element discovery:

```typescript
const harnessTools = generateTools(registry);
for (const tool of harnessTools) {
  extension.tools.register({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    handler: (args) => {
      // Route to harness handler
      return handleHarnessCommand(tool.handler, args, session);
    },
  });
}
```

### Phase 4: Testing

#### 4.1 Unit tests (cue-core, fast)

Location: `packages/cue-core/test/`

Tests run with synthetic messages and mock registries. No Pi dependency.

**scanner.test.ts**
- Finds `[Element]`, `[Element: Tag]`, `[Element: Tag > Tag]`
- Finds `{@path}`, `{@glob}`
- Finds `:command` and `/alias` at message-initial position
- Skips fenced code blocks (``` and ~~~)
- Skips inline code spans
- Reports malformed directives
- Handles empty messages
- Handles messages with no directives

**coalescer.test.ts**
- Merges same-element + same-scope directives
- Preserves tag order by first appearance
- Does not merge different scope targets
- Dedupes identical scope-only directives by content hash
- Preserves message ordering

**resolver.test.ts**
- Resolves element from registry
- Resolves tag chain left-to-right
- Applies overrides conflict resolution (leftmost wins)
- Includes Default Behavior unless exclusive tag present
- Errors on unknown element
- Errors on unknown tag
- Errors on transform without scope
- Handles `[[uses]]` shared tag resolution

**injector.test.ts**
- Builds augmentation block for unscoped cues
- Attaches scoped cues to content chunks
- Injects scope-only as passive context
- Respects budget limits
- Formats augmentation as system-level message

**tracer.test.ts**
- Builds section index from markdown body
- Maps tag names to byte-offset ranges
- Extracts correct byte range at dispatch time
- Invalidates cache on mtime change
- Validates tag/section correspondence
- Handles shared tags via `[[uses]]`

**budget.test.ts**
- Estimates tokens via chars/4
- Prioritizes scoped > unscoped+tags > unscoped
- Defers low-priority when budget exceeded
- Reports stats

**dispatch.test.ts** (integration)
- Full pipeline: scan → coalesce → resolve → inject
- End-to-end: user message → augmentation block
- Error cases: unknown element, missing scope on transform
- Aliases expand before scanning
- Scope-only deduplication
- Budget enforcement

#### 4.2 Integration tests (Pi hooks, in existing suite)

Location: `packages/coding-agent/test/` or `packages/agent/test/`

Tests use Pi's existing test infrastructure (virtual terminal, mock provider).

- `beforeTurn` hook fires before model call
- `afterTurn` hook captures tool results
- `onCompaction` hook clears cues
- Built-in commands take precedence over aliases
- Harness tools are callable by the model
- Augmentation block appears in correct message position
- Full turn lifecycle: input → dispatch → model → tool → dispatch

#### 4.3 Verification commands

After implementation:

1. Run cue-core unit tests:
   ```bash
   cd packages/cue-core && node --test test/*.test.ts
   ```

2. Run Pi integration tests:
   ```bash
   ./test.sh
   ```

3. Run full check:
   ```bash
   npm run check
   ```

4. Manual smoke test in tmux:
   - Type `{@src/some-file}` → verify content injected as passive context
   - Type `{@src/main.ts:10-20}` → verify line range injected
   - Type `[Answer: Technical]{@src/main.ts}` → verify technical framing injected
   - Type `:mode plan` → verify stripped from model input
   - Type `/commit` → verify alias expands to full cue
   - Verify model receives augmentation block before user message

## Implementation order

1. Create `packages/cue-core/` with package.json, tsconfig
2. Implement types.ts
3. Implement scanner.ts + scanner.test.ts (run and pass)
4. Implement coalescer.ts + coalescer.test.ts (run and pass)
5. Implement tracer.ts + tracer.test.ts (run and pass)
6. Implement resolver.ts + resolver.test.ts (run and pass)
7. Implement injector.ts + injector.test.ts (run and pass)
8. Implement budget.ts + budget.test.ts (run and pass)
9. Implement registry.ts (filesystem discovery)
10. Implement aliases.ts (config loading)
11. Implement tool-generator.ts
12. Implement dispatch.ts + dispatch.test.ts (full pipeline, run and pass)
13. Implement index.ts (public API)
14. Add agent loop hooks to Pi core (~6 lines)
15. Implement pi-integration.ts (hook wiring)
16. Add integration tests to Pi test suite
17. Run `npm run check`, fix all errors
18. Manual smoke test in tmux

## File list

### New files

- `packages/cue-core/package.json`
- `packages/cue-core/tsconfig.json`
- `packages/cue-core/tsconfig.build.json`
- `packages/cue-core/src/index.ts`
- `packages/cue-core/src/types.ts`
- `packages/cue-core/src/scanner.ts`
- `packages/cue-core/src/coalescer.ts`
- `packages/cue-core/src/resolver.ts`
- `packages/cue-core/src/injector.ts`
- `packages/cue-core/src/tracer.ts`
- `packages/cue-core/src/budget.ts`
- `packages/cue-core/src/tool-generator.ts`
- `packages/cue-core/src/registry.ts`
- `packages/cue-core/src/aliases.ts`
- `packages/cue-core/src/pi-integration.ts`
- `packages/cue-core/test/scanner.test.ts`
- `packages/cue-core/test/coalescer.test.ts`
- `packages/cue-core/test/resolver.test.ts`
- `packages/cue-core/test/injector.test.ts`
- `packages/cue-core/test/tracer.test.ts`
- `packages/cue-core/test/budget.test.ts`
- `packages/cue-core/test/dispatch.test.ts`

### Modified files

- `packages/agent/src/index.ts` (add beforeTurn/afterTurn/onCompaction hooks, ~6 lines)
- Root `package.json` (add cue-core to workspaces)
- Root `tsconfig.json` (add path alias for cue-core)

## Element format reference

### Element TOML

```toml
[element]
name        = "answer"
description = "Answer questions with configurable behavior"
version     = "1.0.0"
class       = "model"
allowed-tools = "Read, Grep, Glob"

[tags.human]
description = "Answer in a natural, human-like tone"
overrides   = ["tone", "structure"]

[tags.brief]
description = "One paragraph maximum"
overrides   = ["length"]

[tags.technical]
description = "Technical depth, precise terminology"
overrides   = ["depth"]
```

### Element MD

```markdown
## Default Behavior
Answer the user's question clearly and accurately. Lead with the answer,
explain only what the task requires. No preamble, no trailing offers.

## Tag: Human
Use natural, conversational language. Write as a knowledgeable peer, not
a formal assistant. Avoid jargon unless the user's question requires it.

## Tag: Brief
Constrain the response to one paragraph maximum. If the answer requires
more detail, ask the user to request elaboration.

## Tag: Technical
Use precise technical terminology. Include specific details: function names,
line numbers, error codes. Assume the user has engineering background.
```

### Shared tag file

```markdown
## Tag: Rust
Use Rust 2021 edition idioms. Prefer `match` over chained `if let`.
Use `thiserror` for library errors, `anyhow` for application errors.
Prefer `Iterator` combinators over manual loops where readable.
```

### Alias config

```toml
# ~/.pi/aliases.toml
commit = "[Commit]{@git, tone: concise}"
review = "[Review: Technical]{@code, depth: high}"
explain = "[Explain]{@docs, length: brief}"
```
