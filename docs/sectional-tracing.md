# Sectional Tracing

Why dispatch cost is independent of how many tags an element has, and the single
canonical description of how section discovery, validation, and runtime extraction
work. Other docs reference this page — they do not re-describe the mechanism.

## The problem with whole-body loading

Every existing skill system treats disclosure as binary: a skill is either not
loaded, or fully loaded. If `Code` has ten language tags and one review tag,
invoking `[Code: rust]` under the naive model pulls Python, Go, Java, C++, SQL,
Debug, and Review instructions into context alongside Rust — eleven-twelfths of
which the model will never use this turn.

Cue does not load the file. **It traces the tag, then extracts only the matching
section.**

## The mechanism — two phases

Sectional tracing has two phases that run at different times: **validation** (at
index-build time, once per file change) and **tracing** (at dispatch time, once per
invocation). They share one canonical key: the `## Tag:` header.

### Phase 1: Validation (index-build time)

An element's markdown body is a sequence of named sections, each anchored by a
`## Tag:` header that corresponds to a tag declared in the frontmatter:

```markdown
## Default Behavior
...

## Tag: Rust
...

## Tag: Go
...
```

At index-build time (triggered by file-mtime change), the harness builds a
**section index** by scanning for `## Tag:` headers. This is the same step that
validates the element: every tag declared in `[tags.*]` must have a matching
`## Tag:` subtitle, and every `## Tag:` subtitle must correspond to a declared tag.
A mismatch in either direction is a build-time warning — see
[Validation](#validation) below.

### Phase 2: Tracing (dispatch time)

The section index maps each tag name to a byte-offset range within the file:

```json
{
  "code": {
    "default": [128, 890],
    "rust":    [4120, 5310],
    "go":      [3400, 4118],
    "debug":   [7800, 8650]
  }
}
```

When `[Code: rust]` fires, the dispatcher seeks directly to byte 4120 and reads
exactly 1190 bytes. The Go, Debug, and other sections are never opened, never read
off disk, never tokenized.

The byte-offset index is a **cached, derived artifact** — invalidated on file-mtime
change and rebuilt by re-scanning `## Tag:` headers. The header is the canonical
key; the offset is an optimization. If the cache is stale (file changed since last
build), the harness rebuilds it before tracing.

## Matching rule

Tag-to-subtitle matching is case-insensitive and hyphen/space-normalized — `with-tests`
matches `## Tag: With Tests` identically. Slugify-and-compare, not exact string match.

## Composed tags trace independently

`[Code: rust > With-Tests]` performs two independent lookups — `code.rust` and
`code.with-tests` — and concatenates both extracted sections in left-to-right order.
No combined "rust+with-tests" section to author or maintain. This is what makes the
$n+m$ efficiency real: sections are authored once, individually, and traced
independently at dispatch.

## The Default Behavior exception

Default Behavior is included by default whenever any tag is traced, because most
tags *modify* the default rather than replace it. A tag may opt out via an `exclusive`
flag:

```toml
[tags.debug]
description = "Find and diagnose bugs in existing code"
overrides   = ["mode", "output"]
exclusive   = true
```

When `exclusive = true`, the dispatcher skips Default Behavior for that dispatch.

## Formalization

Let an element's body be partitioned into disjoint sections $S = \{s_0, s_1, \ldots,
s_k\}$, where $s_0$ is Default Behavior and each $s_i$ ($i \ge 1$) corresponds to tag
$t_i$. For a dispatched chain $\tau = (t_1, \ldots, t_n)$ with section mapping
$\pi(t) \to i$:

$$
\text{Context}_{\text{cue}}(e, \tau) = \big[\, s_0 \text{ if not exclusive} \,\big] \,\|\, s_{\pi(t_1)} \,\|\, \cdots \,\|\, s_{\pi(t_n)}
$$

Against the naive full-load baseline:

$$
\text{Context}_{\text{naive}}(e) = s_0 \,\|\, s_1 \,\|\, \cdots \,\|\, s_k
$$

The savings on any single dispatch:

$$
\text{Savings}(e, \tau) = \sum_{i \notin \{0\} \cup \pi(\tau)} L(s_i)
$$

exactly the token length of every tag section *not* invoked. For an element with $k$
tags where a typical directive invokes $n \ll k$ of them, the fraction of the body
actually paid for approaches $n/k$, not $1$.

## Why this matters more as elements grow

The naive model punishes exactly the elements you most want to build out. Sectional
Tracing inverts this: **the cost of a dispatch is a function of the tags requested,
never a function of how many tags exist.** Grow `Code` to fifty languages without a
single existing `[Code: rust]` call paying one extra token for it.

## Validation

At index-build time, lint the frontmatter against the markdown body — this is
[Phase 1](#phase-1-validation-index-build-time) of the mechanism above:

- Every tag declared in `[tags.*]` must have a matching `## Tag:` subtitle.
- Every `## Tag:` subtitle must correspond to a declared tag (or a shared include
  via `[[uses]]`).
- A mismatch in either direction is a build-time warning, not a runtime silent gap.
- This validation is **the same step** that builds the byte-offset index — no
  separate pass required.

For cross-element consistency (shared tags, version drift), see
[shared-tags.md](shared-tags.md) and [registry-and-discovery.md](registry-and-discovery.md).
