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

### v2 backend: environment-variable passthrough

For v2, secrets are stored as **environment variables** in a per-project `.env`
file. This is the simplest portable backend — no OS keychain dependency, no encryption
library, works everywhere `dotenv` works.

**Storage path:**
```
~/.cue/secrets/<project-slug>/.env
```

Where `<project-slug>` is the directory name of the project root (e.g., if you're
working in `/home/user/my-app`, the slug is `my-app`).

**File format:** standard `KEY=VALUE` lines, one per secret:
```
PG_HOST=localhost
PG_USER=admin
PG_PASSWORD=s3cret
```

**Key-naming scheme:** `{ELEMENT}_{INPUT_NAME}` — uppercase, underscore-separated.
The element prefix avoids collisions when two elements declare the same input name.
If the element name is already uppercase (e.g., `PG_HOST` inside the `postgres`
element), use the bare input name (the element namespace is implicit in the file's
location).

### Lifecycle

1. **First dispatch:** the element declares `inputs = ["PG_HOST", "PG_USER"]`.
   Neither is in the `.env` file. The harness prompts the user once per missing
   input, then writes them to `~/.cue/secrets/<project>/.env`.
2. **Subsequent dispatches:** the harness reads from the `.env` file. No prompt.
3. **Substitution:** the body references variables by name (`$PG_HOST`). The
   resolver substitutes from the store **after tracing, before injection** — the
   variable never appears in the element file itself.
4. **Revocation:** delete the `.env` file or remove the line. Next dispatch prompts
   again.

### Example

```
[Query: Analyze]{@db/schema.sql}
```

The `postgres` element's traced section contains `$PG_HOST` — substituted from
`~/.cue/secrets/my-app/.env`, never persisted in plaintext in the element file.

### Future backends (not v2)

| Backend | When to use | Notes |
|---|---|---|
| OS keychain (macOS Keychain, `secret-service`) | Shared machines, CI/CD | Requires platform-specific bindings |
| Encrypted local file (age, gpg) | Offline-first, air-gapped | Requires crypto dependency |
| Vault/KMS integration | Enterprise, team-shared | Requires network + auth |

The `.env` backend is deliberately simple. It proves the lifecycle (prompt → store →
substitute) without requiring any platform-specific code. Swapping backends later is
a one-interface change — the rest of the spec is backend-agnostic.

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
