# Integration Guide

How to adopt Cue in an agent harness. This guide walks through wiring a Cue
dispatcher into a new project, step by step.

## Prerequisites

- A harness with a hook that fires before the model call (pre-model-call hook)
- The Cue spec cloned locally

## Step 1: Set up the element registry

Elements live in `~/.cue/elements/`. Each element is a `.toml` + `.md` pair inside
an `author/` subdirectory:

```
~/.cue/elements/
├── maikel/
│   ├── answer.toml
│   ├── answer.md
│   ├── code.toml
│   └── code.md
└── your-name/
    ├── my-element.toml
    └── my-element.md
```

Shared tags live in `~/.cue/tags/`:

```
~/.cue/tags/
├── rust.md
└── with-tests.md
```

## Step 2: Implement the dispatcher

The dispatcher pipeline has five stages. Each is independent:

1. **Scanner** — find `[Element: Tag]`, `{@path}`, `:command` in user input
2. **Coalescer** — merge same-element+same-scope directives
3. **Resolver** — look up elements, trace sections, resolve overrides
4. **Substitutor** — replace directive syntax with `inline` text (if hook supports it)
5. **Injector** — attach resolved text to model context

See [docs/dispatch-architecture.md](docs/dispatch-architecture.md) for the full
pipeline specification.

## Step 3: Register the hook

Wire the dispatcher into your harness's pre-model-call hook. The hook should:

1. Read the user's input
2. Run it through the dispatcher pipeline
3. If `class: harness` directives are found, route them to native handlers and
   short-circuit (model never sees them)
4. If `class: model` directives are found, inject the resolved text as
   `additionalContext`
5. Return the (possibly modified) input to the harness

The exact hook mechanism depends on your harness. The Cue spec is
hook-agnostic — it defines *what* the dispatcher does, not *how* the harness
calls it.

## Step 4: Create your first element

1. Choose an action name (short, verb or noun, 1-2 syllables): `Review`, `Summarize`,
   `Translate`, etc.

2. Create the `.toml` file:
   ```toml
   [element]
   name        = "review"
   description = "Review code for quality and best practices"
   version     = "1.0.0"
   class       = "model"
   allowed-tools = "Read, Glob, Grep"

   [tags.with-tests]
   description = "Also check test coverage"
   overrides   = ["process"]
   ```

3. Create the `.md` file:
   ```markdown
   ## Default Behavior
   Analyze the code and provide specific, actionable feedback on quality,
   security, and best practices.

   ## Tag: With-Tests
   Additionally check test coverage for touched files.
   ```

4. Place both files in `~/.cue/elements/your-name/`.

## Step 5: Test it

Type a directive in your prompt:

```
[Review: With-Tests]{@src/main.ts}
```

The dispatcher should inject the resolved instructions as context. The model will
see both the directive syntax and the injected instructions (unless the hook
supports prompt rewriting, in which case the syntax is replaced).

## Step 6: Share via lockfile

If you want others to consume your elements, create a `cue.lock` in your project:

```toml
[[element]]
id = "your-name/review"
source = "git@github.com:yourname/cue-elements.git"
commit = "abc123..."
path = "elements/review.toml"
```

Others can clone your elements and drop them into their `~/.cue/elements/` directory.

## Step 7: Add context budget management

To prevent Cue injections from blowing past the context window, implement a context
budget manager that:

1. Estimates token count of each injection (~4 chars/token)
2. Prioritizes scoped directives over unscoped
3. Compresses or defers low-priority injections when budget is tight
4. Reports context pressure to the user

See [docs/dispatch-architecture.md](docs/dispatch-architecture.md) § Context budget
management for the full specification.

## Step 8: Wire the turn lifecycle

To make Cue responsive to the agent loop (not just a pre-flight interceptor), hook
into the turn lifecycle:

- **beforeTurn:** re-evaluate active cues, refresh file scopes, measure context
- **afterTurn:** update `{$last}` reference, track cost per turn
- **onCompaction:** clear active cues (users re-apply them cheaply)

See [docs/dispatch-architecture.md](docs/dispatch-architecture.md) § Turn-level
lifecycle for details.

## Troubleshooting

**"Element 'X' not found"** — the element isn't in `~/.cue/elements/`. Check the
directory structure and ensure the `.toml` file has `name = "X"`.

**No output / empty additionalContext** — the prompt has no `[...]` directives. The
scanner only activates on directive syntax.

**Sections not traced correctly** — check that `## Tag: X` headers in the `.md` file
match the tag names in the `.toml` file. The matcher is case-insensitive and
hyphen/space-normalized.

**Context overflow** — large glob scopes (`{@src/**/*.rs}`) can produce many
injections. Implement the context budget manager to handle this gracefully.
