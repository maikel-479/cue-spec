# Elements and Tags

An **element** is a named agentic action — the *what*. A **tag** is a modifier that
changes *how* the element is performed — the *how*. A **directive** is the full unit.

## Element identity

Before creating an element, answer: *"What is the single, irreducible action this
element performs?"* If you can't answer in one sentence, the element is too broad or
not yet understood.

Good: `Answer`, `Search`, `Code`, `Summarize`, `Translate`.
Bad: `Process`, `AnswerAndSearch`, `SmartResponse`, `DoTheThing`.

### Scope test

1. Can the default behavior be described in ~200 words?
2. Are its tags genuinely different execution modes, not style degrees?
3. Would removing it leave a gap no other element covers?

If any answer is no — reconsider the boundary.

## Tag composition and conflict resolution

A tag is an **execution variant**, not a style preference. Two tags that differ only
in tone (not structure) should be one tag with a modifier, not two tags.

### The `overrides` enum

Each tag declares the behavioral dimensions it governs, drawn from a **fixed enum**
(not free text):

```
tone, register, length, depth, structure, format, voice, vocabulary, mode, output,
process, scope, language, sdk, idioms
```

Free-text dimensions make cross-author composition impossible to validate. The enum
makes conflict detection mechanical. Dimensions are grouped by what they govern:

- **Voice/presentation:** `tone`, `register`, `voice`, `vocabulary`, `idioms`
- **Shape/length:** `length`, `depth`, `structure`, `format`
- **Execution:** `mode`, `output`, `process`, `scope`
- **Context:** `language`, `sdk`

```toml
[tags.human]
description = "Answer in a natural, human-like tone"
overrides   = ["tone", "structure", "voice"]

[tags.brief]
description = "One paragraph maximum"
overrides   = ["length"]
```

### Resolution function

For a dispatched tag chain `τ = (t₁, t₂, …, tₙ)` and dimension `δ`:

```
R(δ, τ) = t_i   where i = min{ j | δ ∈ overrides(t_j) }
```

The leftmost tag whose override set contains `δ` wins that dimension. Dimensions no
tag claims fall back to the element's default.

`[Answer: Human > Brief]`:
- `tone` → Human (leftmost claims it)
- `structure` → Human
- `voice` → Human
- `length` → Brief

Result: human tone and structure, constrained to one paragraph. Coherent because the
only shared dimension (`tone` is Human-only; `length` is Brief-only) has no conflict.

`[Answer: Human > Formal]`:
- `tone` → Human wins; `register` → Formal (only Formal claims it)

Result: casual tone, formal register — "professional but warm." Documented, not
surprising, because the conflict was resolved by position.

### Worked example: 3-tag conflict

`[Answer: Human > Technical > Brief]`:

| Dimension | Human | Technical | Brief | Winner |
|---|---|---|---|---|
| `tone` | ✓ | | | Human |
| `structure` | ✓ | | | Human |
| `voice` | ✓ | | | Human |
| `vocabulary` | | ✓ | | Technical |
| `idioms` | | ✓ | | Technical |
| `length` | | | ✓ | Brief |

Result: human tone, structure, and voice; technical vocabulary and idioms; one
paragraph maximum. Human and Technical share no overlapping dimensions, so there is
no conflict to resolve — the composition is clean. Brief is orthogonal to both (it
only governs `length`).

This is the common case: well-designed tags compose without conflict because they
govern different dimensions. Conflicts only arise when two tags claim the *same*
dimension (e.g., `[Answer: Human > Casual]` — both claim `tone`; leftmost wins).

### Conflict observability

Leftmost-wins is silent by default, but the dispatcher **emits a one-line note to a
debug channel** (the `Verbosity: Debug` tier) whenever two tags claim the same
dimension. The model stays clean; the user can audit *why* a composition came out the
way it did. Silence doesn't scale; observability does.

## Same-element multi-occurrence coalescing

When multiple standalone directives in the same message reference the same element
with the **same scope target**, they are coalesced into a single dispatch. Tags are
merged left-to-right by first appearance in the raw text — the same ordering rule
`>` uses within a single bracket.

### Coalescing key

Two directives coalesce iff:
- Element name matches (case-insensitive)
- Scope target is identical (`{@path}` = same path, `{#id}` = same id, `{$last}` =
  `{$last}`, no scope = no scope)

### What coalesces

```
[Answer: NoSlop] ... [Answer: Lean]
→ one dispatch: [Answer: NoSlop > Lean]
```

```
[Answer: NoSlop]{@src/foo.rs} ... [Answer: Lean]{@src/foo.rs}
→ one dispatch: [Answer: NoSlop > Lean]{@src/foo.rs}
```

### What doesn't coalesce

```
[Answer: NoSlop]{@src/foo.rs} ... [Answer: Lean]{@src/bar.rs}
→ two separate dispatches (different scope targets)
```

Wrapped spans never coalesce — each span's boundaries *are* its scope, and two
wrapped spans are never the same span.

### Conflict resolution

The existing `>` machinery applies identically across coalesced occurrences:
- **Leftmost-wins** for `overrides` conflicts (first appearance in the message)
- **`exclusive` OR-reduction** — if *any* tag in the merged chain is `exclusive`,
  `## Default Behavior` is skipped once for the whole dispatch, not per occurrence
- **`## Default Behavior`** is included once for the entire coalesced dispatch

This is not a new mechanism — it's the existing composition math applied to a case
the spec previously didn't name. A second implementer would hit this gap.

## The `inline` field

Tags may declare an optional `inline` field for substitution when the harness
supports prompt rewriting:

```toml
[tags.noslop]
description = "Avoid filler, hedge words, and excessive qualifiers"
inline      = "terse and unpadded"
overrides   = ["tone", "length"]
```

| `inline` present | Behavior |
|---|---|
| Yes | Replace `[Element: Tags]` with the `inline` text before the model sees it |
| No | Brackets stay untouched; `additionalContext` carries the meaning |

**No fallback to `description`.** If `inline` is absent, the bracket syntax remains
visible. One degraded path for two different causes (missing field vs harness that
can't rewrite prompts), not two separate failure modes.

**Composed tags:** if *any* tag in the chain lacks `inline`, the whole chain stays
unsubstituted. The chain is only as substitutable as its weakest link.

`description` remains the catalog entry for discovery and documentation. `inline` is
the substitution surface for prompt rewriting. They serve different audiences.

## Composition limits

- **Max 3 tags.** More than three is a symptom of a missing element or combined tag.
- **Degree is not a variant.** `SlightlyFormal` / `VeryFormal` → one `Formal` tag.
- **Orthogonal dimensions compose cleanly.** `[Technical > Brief]` (vocabulary ×
  length) is clean; `[Brief > Verbose]` is useless (Brief cancels Verbose).

## Element creation checklist

- [ ] Identity is a single, irreducible action
- [ ] Name is short, unambiguous, not compound
- [ ] `allowed-tools` is the *minimum* needed
- [ ] Default behavior answers: orientation, execution, output, boundaries
- [ ] Each tag declares `overrides` from the enum
- [ ] Tags are structural variants, not style degrees
- [ ] Composed examples tested for conflict coherence
- [ ] Element registered (filesystem auto-discovery or `cue.toml`)
