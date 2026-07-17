import { CueDirective, ScopeRef } from "./types.js";

const DIRECTIVE_RE = /\[([A-Za-z][A-Za-z0-9_-]*)(?::\s*([^\]]*?))?\](?:\{([^}]*)\})?/g;
const FENCED_BLOCK_RE = /^(```|~~~)[^\n]*\n[\s\S]*?\1/gm;
const INLINE_CODE_RE = /`([^`\n]+)`/g;

export function scan(prompt: string): CueDirective[] {
  const exclusionRanges = findExclusionRanges(prompt);
  const directives: CueDirective[] = [];
  let match: RegExpExecArray | null;

  DIRECTIVE_RE.lastIndex = 0;
  while ((match = DIRECTIVE_RE.exec(prompt)) !== null) {
    if (isInsideFence(match.index, exclusionRanges)) continue;

    const [raw, element, tagChain, scopeRaw] = match;
    const tags = tagChain
      ? tagChain.split(">").map((t) => t.trim()).filter(Boolean)
      : [];
    const scope = scopeRaw ? parseScope(scopeRaw) : null;

    const beforeMatch = prompt.slice(0, match.index);
    const line = beforeMatch.split("\n").length;
    const lastNewline = beforeMatch.lastIndexOf("\n");
    const col = match.index - lastNewline;

    directives.push({ raw, element, tags, scope, line, col });
  }

  return directives;
}

export function scanSysnav(prompt: string): string | null {
  const trimmed = prompt.trimStart();
  if (!trimmed.startsWith(":")) return null;
  const firstLine = trimmed.split("\n")[0];
  return firstLine;
}

export function scanAlias(prompt: string): string | null {
  const trimmed = prompt.trimStart();
  if (!trimmed.startsWith("/")) return null;
  const firstLine = trimmed.split("\n")[0];
  return firstLine;
}

function findExclusionRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  // Fenced blocks: ``` or ~~~
  const fencedRe = /^(```|~~~)[^\n]*\n[\s\S]*?\1/gm;
  let m: RegExpExecArray | null;
  while ((m = fencedRe.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  // Inline code spans: `...`
  INLINE_CODE_RE.lastIndex = 0;
  while ((m = INLINE_CODE_RE.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  return ranges;
}

function isInsideFence(pos: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => pos >= start && pos < end);
}

function parseScope(raw: string): ScopeRef {
  const parts = raw.split(":");
  const ref = parts[0];
  const mode = (parts[1] as "augment" | "replace") || "augment";

  if (ref.startsWith("@")) {
    const val = ref.slice(1);
    if (val.includes("*") || val.includes("?")) {
      return { type: "glob", value: val, mode };
    }
    return { type: "file", value: val, mode };
  }
  if (ref.startsWith("#")) {
    return { type: "id", value: ref.slice(1), mode };
  }
  if (ref === "$last") {
    return { type: "last", value: "$last", mode };
  }
  return { type: "file", value: ref, mode };
}
