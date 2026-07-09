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
tone, register, length, depth, structure, format, voice, vocabulary, mode, output
```

Free-text dimensions make cross-author composition impossible to validate. The enum
makes conflict detection mechanical.

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

### Conflict observability

Leftmost-wins is silent by default, but the dispatcher **emits a one-line note to a
debug channel** (the `Verbosity: Debug` tier) whenever two tags claim the same
dimension. The model stays clean; the user can audit *why* a composition came out the
way it did. Silence doesn't scale; observability does.

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
