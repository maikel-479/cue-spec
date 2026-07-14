# Contributing to Cue

## Adding an element

1. Choose a name: short (1-2 syllables), verb or noun, unambiguous. `Answer`,
   `Search`, `Code`, `Summarize`. Not `Process` or `DoTheThing`.

2. Create two files in `library/`:
   - `<name>.toml` — element definition
   - `<name>.md` — element body with `## Default Behavior` and `## Tag:` sections

3. Place them under the appropriate directory:
   - `library/prompts/` for prompt-only elements
   - `library/skills/<name>/` for skill elements
   - `library/subagents/<name>/` for harness (subagent) elements

4. Follow the namespace convention: the element ID is `author/element-name`. Your
   author prefix is your GitHub username.

## Element structure

### TOML file

```toml
[element]
name        = "my-element"
description = "One sentence: what this element does"
version     = "1.0.0"
allowed-tools = "Read, Write"     # minimum tools needed

[tags.my-tag]
description = "What this tag changes"
overrides   = ["tone", "format"]  # from the fixed enum
```

### MD file

```markdown
## Default Behavior
What happens when [MyElement] is invoked with no tags. ~200 words max.

## Tag: My-Tag
What this tag modifies. Only write what's different from the default.
```

## Tag rules

- Tags are **execution variants**, not style preferences. Two tags that differ only
  in tone should be one tag with a modifier.
- Each tag declares `overrides` from the fixed enum: `tone, register, length, depth,
  structure, format, voice, vocabulary, mode, output, process, scope, language, sdk,
  idioms`.
- Max 3 tags per composition. More is a symptom of a missing element.
- Use `exclusive = true` to skip Default Behavior for that tag.

## Validation

Before submitting, verify:
- Every `[tags.*]` in the TOML has a matching `## Tag:` in the MD
- Every `## Tag:` in the MD corresponds to a declared tag
- The default behavior answers: orientation, execution, output, boundaries
- Composed examples (e.g., `[Element: Tag1 > Tag2]`) produce coherent output

## Shared tags

If three or more elements need the same tag, promote it to a shared tag in
`library/tags/<name>.md`. Reference it via `[[uses]]` in each element's TOML.

## Testing

Run the dispatcher tests:

```bash
npx tsc && node --test dist/*.test.js
```

## Commit messages

Use `<file/doc>: <what changed>, <why>` format. One logical change per commit.
