import * as fs from "fs";
import * as path from "path";
import { CueDirective, ElementDef, TagDef, SectionRange, ResolvedDirective, UsesDef } from "./types.js";

const CUE_DIRS = [
  path.join(process.env.HOME || "~", ".cue"),
  path.join(process.env.CLAUDE_PROJECT_DIR || ".", ".cue"),
];

function getRegistryRoots(): string[] {
  return CUE_DIRS.filter((d) => fs.existsSync(d));
}

export function discoverElements(): Map<string, ElementDef> {
  const elements = new Map<string, ElementDef>();
  for (const root of getRegistryRoots()) {
    const elementsDir = path.join(root, "elements");
    if (!fs.existsSync(elementsDir)) continue;

    for (const authorDir of fs.readdirSync(elementsDir)) {
      const authorPath = path.join(elementsDir, authorDir);
      if (!fs.statSync(authorPath).isDirectory()) continue;

      for (const file of fs.readdirSync(authorPath)) {
        if (!file.endsWith(".toml")) continue;
        const name = file.replace(".toml", "");
        const tomlPath = path.join(authorPath, file);
        const mdPath = tomlPath.replace(".toml", ".md");

        if (!fs.existsSync(mdPath)) continue;

        const def = parseElementToml(tomlPath, mdPath);
        if (def) {
          const key = `${authorDir}/${name}`;
          elements.set(key, def);
          elements.set(name, def);
        }
      }
    }
  }
  return elements;
}

function parseElementToml(tomlPath: string, mdPath: string): ElementDef | null {
  try {
    const content = fs.readFileSync(tomlPath, "utf-8");
    const el: ElementDef = {
      name: "",
      description: "",
      version: "1.0.0",
      class: "model",
      tags: {},
      uses: [],
      bodyPath: mdPath,
      tomlPath,
    };

    let currentSection = "";
    let currentTag = "";

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed) continue;

      const sectionMatch = trimmed.match(/^\[(.+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        if (currentSection === "element") continue;
        if (currentSection.startsWith("tags.")) {
          currentTag = currentSection.slice(5);
          el.tags[currentTag] = { description: "", overrides: [] };
        }
        continue;
      }

      const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
      if (!kvMatch) continue;
      const [, key, rawVal] = kvMatch;
      const val = rawVal.replace(/^["']|["']$/g, "");

      if (currentSection === "element") {
        if (key === "name") el.name = val;
        else if (key === "description") el.description = val;
        else if (key === "version") el.version = val;
        else if (key === "class") el.class = val as "model" | "harness";
        else if (key === "handler") el.handler = val;
      } else if (currentSection.startsWith("tags.") && currentTag) {
        if (key === "description") el.tags[currentTag].description = val;
        else if (key === "overrides") {
          const arrMatch = rawVal.match(/\[(.*)\]/);
          if (arrMatch) {
            el.tags[currentTag].overrides = arrMatch[1]
              .split(",")
              .map((s) => s.trim().replace(/^["']|["']$/g, ""));
          }
        } else if (key === "exclusive") {
          el.tags[currentTag].exclusive = val === "true";
        }
      } else if (currentSection === "uses") {
        if (key === "tag") {
          el.uses.push({ tag: val, source: "" });
        } else if (key === "source" && el.uses.length > 0) {
          el.uses[el.uses.length - 1].source = val;
        }
      }
    }

    return el.name ? el : null;
  } catch {
    return null;
  }
}

export function resolveSections(
  element: ElementDef,
  tags: string[]
): SectionRange[] {
  const body = fs.readFileSync(element.bodyPath, "utf-8");
  const index = buildSectionIndex(body);
  const sections: SectionRange[] = [];

  const defaultSection = index.find((s) => s.tag === "default");
  if (defaultSection) {
    const hasExclusive = tags.some((t) => {
      const tagDef = element.tags[t.toLowerCase().replace(/\s+/g, "-")];
      return tagDef?.exclusive;
    });
    if (!hasExclusive) {
      sections.push(defaultSection);
    }
  }

  for (const tag of tags) {
    const normalized = tag.toLowerCase().replace(/[\s-]+/g, "-");
    const section = index.find(
      (s) => s.tag.toLowerCase().replace(/[\s-]+/g, "-") === normalized
    );
    if (section) {
      sections.push(section);
    }
  }

  return sections;
}

function buildSectionIndex(body: string): SectionRange[] {
  const sections: SectionRange[] = [];
  const headerRe = /^##\s+(?:Tag:\s+)?(.+)$/gm;
  let match: RegExpExecArray | null;
  const headerPositions: Array<{ name: string; pos: number }> = [];

  while ((match = headerRe.exec(body)) !== null) {
    headerPositions.push({ name: match[1].trim(), pos: match.index });
  }

  for (let i = 0; i < headerPositions.length; i++) {
    const start = headerPositions[i].pos;
    const end =
      i + 1 < headerPositions.length
        ? headerPositions[i + 1].pos
        : body.length;
    const name = headerPositions[i].name;

    if (name.toLowerCase() === "default behavior") {
      sections.push({ start, end, tag: "default" });
    } else if (name.toLowerCase().startsWith("tag:")) {
      sections.push({ start, end, tag: name.slice(4).trim() });
    } else {
      sections.push({ start, end, tag: name });
    }
  }

  return sections;
}

export function resolveOverrides(
  tags: string[],
  element: ElementDef
): Map<string, string> {
  const dimensions = new Map<string, string>();

  for (const tag of tags) {
    const normalized = tag.toLowerCase().replace(/[\s-]+/g, "-");
    const tagDef = element.tags[normalized];
    if (!tagDef) continue;

    for (const dim of tagDef.overrides) {
      if (!dimensions.has(dim)) {
        dimensions.set(dim, tag);
      }
    }
  }

  return dimensions;
}

export function resolve(
  directive: CueDirective,
  elements: Map<string, ElementDef>
): ResolvedDirective | null {
  const element =
    elements.get(directive.element) ||
    elements.get(directive.element.toLowerCase()) ||
    elements.get(directive.element.toLowerCase().replace(/\s+/g, "-")) ||
    elements.get(camelToKebab(directive.element));

  if (!element) return null;

  const sectionRanges = resolveSections(element, directive.tags);
  const body = fs.readFileSync(element.bodyPath, "utf-8");
  const sections = sectionRanges.map((r) => body.slice(r.start, r.end).trim());
  const text = sections.join("\n\n");

  resolveOverrides(directive.tags, element);

  return { directive, element, sections, text };
}

function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
