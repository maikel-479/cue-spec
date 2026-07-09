# `docx` — converted from the Anthropic `docx` skill

Source: https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md
Original: a single large `SKILL.md`. Converted so each operation is a traced tag.

## `docx.toml`

```toml
[element]
name        = "docx"
description = "Create, read, edit, or convert Word (.docx) documents"
version     = "1.0.0"
allowed-tools = "Bash, Read, Edit, Write"

[tags.create]
description = "Generate a new .docx with docx-js"
overrides   = ["mode", "format", "output"]

[tags.read]
description = "Extract or analyze content from a .docx"
overrides   = ["mode"]

[tags.edit]
description = "Unpack, edit XML, repack an existing .docx"
overrides   = ["mode", "format"]

[tags.convert]
description = "Convert to/from .docx (pdf, images, legacy .doc)"
overrides   = ["mode"]
```

## `docx.md`

```markdown
## Default Behavior
A .docx file is a ZIP archive of XML. Read/analyze with `pandoc` or unpack for raw
XML. Create new documents with `docx-js` (`npm install -g docx`). Edit by unpack →
edit XML → repack. Do NOT use for PDFs, spreadsheets, or general coding.

Quick reference:
| Task                | Approach                                  |
| Read/analyze        | `pandoc` or `scripts/office/unpack.py`    |
| Create new          | `docx-js` (see Tag: Create)               |
| Edit existing       | Unpack → edit XML → repack (Tag: Edit)    |
| Convert             | `soffice.py` / `pdftoppm` (Tag: Convert)  |

## Tag: Create
Generate .docx with JavaScript, then validate.

CRITICAL rules (verbatim from upstream):
- Set page size explicitly — docx-js defaults to A4, not US Letter. US Letter =
  12240 x 15840 DXA.
- Landscape: pass portrait dimensions; docx-js swaps internally.
- NEVER use `\n` — use separate Paragraph elements.
- NEVER use unicode bullets — use `LevelFormat.BULLET` with numbering config.
- PageBreak must be inside a Paragraph.
- ImageRun requires `type` (png/jpg/...).
- Always set table `width` with DXA — never `WidthType.PERCENTAGE` (breaks in
  Google Docs). Tables need dual widths: `columnWidths` AND cell `width`, both DXA,
  summing exactly.
- Use `ShadingType.CLEAR`, never SOLID, for table shading.
- TOC requires `HeadingLevel` only; include `outlineLevel` (0 for H1, 1 for H2).
- Override built-in styles with exact IDs ("Heading1", "Heading2", ...).

After creating, validate: `python scripts/office/validate.py doc.docx`.

## Tag: Read
Text extraction with tracked changes:
  pandoc --track-changes=all document.docx -o output.md
Raw XML:
  python scripts/office/unpack.py document.docx unpacked/

## Tag: Edit
Follow all 3 steps in order.
1. Unpack: `python scripts/office/unpack.py document.docx unpacked/`
2. Edit XML in `unpacked/word/` with the Edit tool (string replace, not scripts).
   Use "Claude" as author for tracked changes unless the user requests otherwise.
   Use smart-quote XML entities for new text (&#x2019; etc.).
3. Pack: `python scripts/office/pack.py unpacked/ output.docx --original document.docx`
   (validates with auto-repair).

## Tag: Convert
- Legacy `.doc` → `.docx`: `python scripts/office/soffice.py --headless --convert-to docx document.doc`
- `.docx` → images: convert to pdf, then `pdftoppm -jpeg -r 150 document.pdf page`
- Accept tracked changes: `python scripts/accept_changes.py input.docx output.docx`
```
