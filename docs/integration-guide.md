# Integration Guide

How to adopt Cue in a second harness. This guide walks through wiring the reference
dispatcher into a new project, step by step.

## Prerequisites

- A harness with a hook that fires before the model call (e.g., Claude Code's
  `UserPromptSubmit`, or a future OpenCode `chat.request.before`)
- Node.js 18+ installed
- The cue-spec repo cloned locally

## Step 1: Install the dispatcher

```bash
# Clone cue-spec somewhere persistent
git clone https://github.com/maikel-479/cue-spec.git ~/.cue-spec

# Build it
cd ~/.cue-spec && npm install && npx tsc
```

## Step 2: Set up the element registry

Elements live in `~/.cue/elements/`. Each element is a `.toml` + `.md` pair inside
an `author/` subdirectory:

```
~/.cue/elements/
├── maikel-479/
│   ├── answer.toml
│   ├── answer.md
│   ├── claude-api.toml
│   └── claude-api.md
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

## Step 3: Register the hook

### Claude Code

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.cue-spec/dist/index.js"
          }
        ]
      }
    ]
  }
}
```

### OpenCode (when `chat.request.before` ships)

Add to `opencode.json`:

```json
{
  "hooks": {
    "chat.request.before": {
      "command": "node ~/.cue-spec/dist/index.js"
    }
  }
}
```

Note: OpenCode's hook surface is still in development as of July 2026. Check
[#19425](https://github.com/anomalyco/opencode/issues/19425) for status.

## Step 4: Create your first element

1. Choose an action name (short, verb or noun, 1-2 syllables): `Review`, `Summarize`,
   `Translate`, etc.

2. Create the `.toml` file:
   ```toml
   [element]
   name        = "review"
   description = "Review code for quality and best practices"
   version     = "1.0.0"
   allowed-tools = "Read, Glob, Grep"

   [tags.with-tests]
   description = "Also check test coverage"
   overrides   = ["scope"]
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
see both the directive syntax and the injected instructions (Claude Code's
`UserPromptSubmit` cannot strip the original prompt).

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

## Troubleshooting

**"Element 'X' not found"** — the element isn't in `~/.cue/elements/`. Check the
directory structure and ensure the `.toml` file has `name = "X"`.

**No output / empty additionalContext** — the prompt has no `[...]` directives. The
scanner only activates on directive syntax.

**Sections not traced correctly** — check that `## Tag: X` headers in the `.md` file
match the tag names in the `.toml` file. The matcher is case-insensitive and
hyphen/space-normalized.
