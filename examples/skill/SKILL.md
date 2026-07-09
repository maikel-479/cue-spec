---
name: code-review
description: Review a diff or PR for bugs, security, and maintainability. Use when the user asks to "review" code, or when a change is staged/committed and quality gates should run. Trigger automatically after edits to critical paths.
---

# Code Review

Review the provided diff or the working tree against `main`. Return a prioritized list
of findings, not a rewrite.

## What to check

- **Correctness:** off-by-one, null/empty handling, race conditions, wrong types.
- **Security:** injection, secret handling, unsafe deserialization, authz gaps.
- **Maintainability:** dead code, misleading names, missing error handling.

## How to report

Use this shape, highest severity first:

```
### Findings
- [HIGH] path:line — one sentence on the problem + the minimal fix
- [MED]  path:line — ...
- [LOW]  path:line — ...
### Verdict
approve | request-changes (with the blocking items named)
```

If the diff is clean, say so in one line. Do not invent issues to seem thorough.

## References

- `references/security-checklist.md` — loaded only when reviewing auth or input paths.
- `references/style.md` — project convention rules; loaded only when the change
  touches formatted code.

## Scripts (optional)

- `scripts/diff-stat.sh` — prints added/removed per file; run before reviewing to size
  the change.
