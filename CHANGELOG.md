# Changelog

## v0.4.2 (August 2026)

### Alias ↔ skill ↔ cue integration

- **Aliases are config mappings**, not a separate tier — they live in
  `~/.pi/aliases.toml` or project `cue.toml`, mapping short `/name` to full
  Cue expressions
- **Skills and cues are orthogonal** — skills define capabilities (tools,
  instructions), cues define behavior (tone, length, constraints). Aliases
  bridge them.
- **Alias expansion stage added to dispatch pipeline** — `/name` expands to a
  Cue directive before the scanner runs, then inherits Cue's composition and
  scoping

### Documentation updates

- `docs/grammar.md` — expanded alias tier section with skill/cue integration
  explanation and resolution semantics
- `docs/dispatch-architecture.md` — added alias expander stage to pipeline,
  added skill+cue integration section with capability matrix
- `README.md` — updated three-tier table to show aliases as config mappings,
  added v0.4.2 to "What's new"

## v0.4.1 (August 2026)

### First-class scopes

- **Scopes are independent statements** — `{@file}`, `{#id}`, `{$last}` work without
  a `[...]` wrapper; they are first-class constructs in the grammar
- **Scope-only = passive injection** — no behavioral framing, content injected as
  reference material; augment by default, fails safe
- **Scoped cues unchanged** — `[Element: Tag]{@scope}` still works as before; the
  scope attaches behavioral framing to the content chunk
- **Updated grammar** — BNF now shows `<statement> ::= <cue> | <scope>`, not just
  `<directive> ::= "[" ... <scope> ... "]"`
- **Updated dispatch pipeline** — scanner produces both cue and scope-only items;
  coalescer only groups cues; resolver handles both paths independently

## v0.4 (August 2026)

### Spec overhaul — harness-agnostic, research-grounded

- **Removed Claude Code-specific framing** — all docs now reference generic
  pre-model-call hooks, not `UserPromptSubmit` specifically
- **Removed reference implementation** (`src/`, `dist/`, `package.json`, `tsconfig.json`)
  — the spec stands alone without tied-to-a-specific-harness code
- **Removed `.mimocode/`** — external plugin config, not part of the Cue spec

### Simplified syntax

- **Removed wrap boundary** — `[Element]...[/Element]` syntax eliminated; directives
  apply to the next content block or scoped chunk
- **Removed scope mode suffix** — `:augment`/`:replace` is no longer user syntax;
  determined by element `class` (`model` → augment, `transform` → replace)
- **Removed version pin from user syntax** — `[Element@1.2: Tag]` no longer valid;
  version management is an internal registry concern
- **Reduced behavioral dimensions from 15 to 8** — the fixed enum is now:
  `tone`, `length`, `depth`, `structure`, `format`, `mode`, `output`, `process`
  (removed: `register`, `voice`, `vocabulary`, `scope`, `language`, `sdk`, `idioms`)

### New spec concepts

- **Context budget management** — dispatcher spec now defines how to handle context
  window pressure from injections (priority ordering, compression, deferral)
- **Turn-level lifecycle** — dispatch architecture recommends `beforeTurn`/`afterTurn`
  hooks instead of a one-shot pre-flight interceptor
- **Graph-based turn execution** — dispatch pipeline modeled as explicit state
  transitions, not a monolithic loop
- **Element class taxonomy** — `model` (behavioral injection), `harness` (native
  handler), `transform` (consumes input, replaces chunk)
- **Domain-specific dimensions** — elements may declare dimensions beyond the standard
  8 for element-specific composition (e.g., `language`, `sdk` in `claude-api`)

### Documentation updates

- All 10 spec documents updated for harness-agnostic framing
- `docs/dispatch-architecture.md` rewritten with context budget, turn lifecycle,
  graph-based execution, and harness capability matrix
- `docs/rationale.md` updated with context engineering research (Anthropic Sep 2025)
- `docs/integration-guide.md` rewritten as a generic harness adoption guide
- `library/README.md` updated with domain-specific dimension guidance
- `CONTRIBUTING.md` updated with 8-dimension enum and element class taxonomy

## v0.3 (July 2026)

### Spec correctness
- Resolved tracing-mechanism contradiction: `sectional-tracing.md` is now the single
  canonical source for validation + tracing; other docs link to it (#6)
- Finalized `overrides` enum with 5 missing dimensions (`process`, `scope`,
  `language`, `sdk`, `idioms`) and a 3-tag conflict worked example (#7, closes #1)
- Added concrete tool schema for harness cues with the dual-surface pattern
  (colon syntax + callable tool) (#8, closes #2)
- Defined the secret-store interface concretely: env-var passthrough with per-project
  `.env` files, key-naming scheme, and full lifecycle (#9, closes #3)
- Documented Claude Code `UserPromptSubmit` hook limitation: cannot rewrite prompt
  text, only inject `additionalContext`. Stripper stage deferred (#13)

### Reference implementation
- Built `src/` — a working Claude Code `UserPromptSubmit` hook (#14)
  - `scanner.ts`: finds `[Element: Tag]`, `{@path}`, `:command`; skips fenced code
    blocks
  - `resolver.ts`: discovers elements, parses TOML + MD, traces sections via header
    matching, resolves tag composition
  - `index.ts`: hook entry point reading JSON from stdin, outputting
    `additionalContext`
- 27 automated tests passing: directive parsing, fenced code block skipping,
  section tracing, tag composition, error handling

### Documentation
- Added `docs/integration-guide.md` — adoption walkthrough for second harnesses
- Added `CONTRIBUTING.md` with namespace convention and element creation rules
- Updated README to v0.3 with reference implementation section

### New issues opened
- #10: Registry namespace + distribution convention (documented, needs implementation)
- #11: Adversarial/edge-case behavior (documented, needs automated tests)
- #12: Naming disambiguation (awaiting human decision)
- #16: Deferred Loom wiring (blocked on OpenCode hook surface)

## v0.2 (June 2026)

- Initial spec: 1,531 lines across 9 docs + TOML config
- Library elements: answer, claude-api, docx, reviewer
- Three-tier syntax: Cue directives, system nav, aliases
- Sectional tracing, scoped directives, shared tags, composition
- No implementation (spec only)
