# Changelog

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
- Added `docs/integration-guide.md` for Claude Code and future OpenCode setup
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
