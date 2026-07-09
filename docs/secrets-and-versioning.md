# Secrets and Versioning

Three primitives the spec must ship or it repeats the gaps in every existing skill
standard.

## 1. Secret / variable injection

A skill that needs credentials today has two bad options: prompt every run, or
hardcode the secret in the body. Neither is acceptable for distribution.

Cue elements and tags may declare inputs:

```toml
[element]
name = "postgres"
inputs = ["PG_HOST", "PG_USER", "PG_PASSWORD"]
```

At first use, the harness prompts once and stores the value in its own secret store
(never written to the body file, never committed). Subsequent dispatches read from
the store. The body references the variable by name; the resolver substitutes it at
dispatch time, after tracing, before injection.

```
[Query: Analyze]{@db/schema.sql}
```

The `postgres` element's traced section may contain `$PG_HOST` — substituted from the
secret store, never persisted in plaintext in the element file.

## 2. Version pinning

If `[Code: rust]` resolves to whatever is on disk, a breaking edit to `rust.md`
silently breaks every downstream session. Skills need versions the way packages do.

```toml
[element]
name = "code"
version = "1.3.0"
```

- A directive may pin: `[Code@1.2: rust]` resolves to the `1.2.x` line.
- Unpinned directives resolve to the latest compatible version in the registry.
- A breaking change (major bump) does not silently affect sessions pinned to the
  prior major.

Distribution without versioning is how skill ecosystems rot. Pinning is table-stakes.

## 3. Lazy loading (restated)

Already covered in [registry-and-discovery.md](registry-and-discovery.md): load
name+description at startup, trace the body on dispatch. Listed here because it is one
of the three load-bearing primitives for a system meant to scale across a community
registry. Eager loading is the single most common way skill systems fail in
production.

## Why these three

Each surfaced from real practitioner reports, not speculation:
- Secret injection — raised repeatedly by skill authors distributing to non-technical
  clients ("no easy way for them to set up credentials").
- Versioning — "we keep standardising without adding versioning."
- Lazy loading — a documented 127K-token context blowup from recursive skill scanning.

Cue adopts all three as requirements, not nice-to-haves.
