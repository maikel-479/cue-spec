#!/usr/bin/env node

import { scan, scanSysnav } from "./scanner.js";
import { discoverElements, resolve, coalesceDirectives } from "./resolver.js";
import { CueDirective, HookInput, HookOutput, ResolvedDirective } from "./types.js";

function substituteDirectives(
  prompt: string,
  directives: CueDirective[],
  resolved: Map<string, ResolvedDirective>
): string | null {
  // Check if all directives have inline text available
  const substitutions: Array<{ directive: CueDirective; inline: string }> = [];

  for (const d of directives) {
    const result = resolved.get(d.raw);
    if (!result) continue;

    // All tags in the chain must have inline for substitution
    const inlineTexts: string[] = [];
    let allHaveInline = true;
    for (const tag of d.tags) {
      const normalized = tag.toLowerCase().replace(/[\s-]+/g, "-");
      const tagDef = result.element.tags[normalized];
      if (tagDef?.inline) {
        inlineTexts.push(tagDef.inline);
      } else if (d.tags.length > 0) {
        allHaveInline = false;
        break;
      }
    }

    if (!allHaveInline || d.tags.length === 0) continue;
    substitutions.push({ directive: d, inline: inlineTexts.join(", ") });
  }

  if (substitutions.length === 0) return null;

  // Sort by position descending so indices stay valid during replacement
  substitutions.sort(
    (a, b) => b.directive.col - a.directive.col || b.directive.line - a.directive.line
  );

  let modified = prompt;
  for (const { directive, inline } of substitutions) {
    // Find the directive's position in the prompt
    const idx = modified.indexOf(directive.raw);
    if (idx === -1) continue;
    modified =
      modified.slice(0, idx) + inline + modified.slice(idx + directive.raw.length);
  }

  return modified;
}

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");

  let input: HookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const prompt = input.prompt || "";
  if (!prompt.trim()) process.exit(0);

  const sysnav = scanSysnav(prompt);
  if (sysnav) {
    process.exit(0);
  }

  const directives = scan(prompt);
  if (directives.length === 0) {
    process.exit(0);
  }

  const elements = discoverElements();
  const coalesced = coalesceDirectives(directives);
  const injections: string[] = [];
  const errors: string[] = [];
  const resolvedMap = new Map<string, ResolvedDirective>();

  for (const directive of coalesced) {
    const result = resolve(directive, elements);
    if (!result) {
      errors.push(
        `Element '${directive.element}' not found at line ${directive.line}`
      );
      continue;
    }

    if (result.element.class === "harness") {
      continue;
    }

    // Map each original directive's raw text to the resolved result
    for (const d of directives) {
      if (d.element.toLowerCase() === directive.element.toLowerCase()) {
        resolvedMap.set(d.raw, result);
      }
    }

    injections.push(result.text);
  }

  if (injections.length === 0 && errors.length === 0) {
    process.exit(0);
  }

  const output: HookOutput = {};

  const contextParts: string[] = [];
  if (errors.length > 0) {
    contextParts.push(`Cue errors:\n${errors.join("\n")}`);
  }
  if (injections.length > 0) {
    contextParts.push(injections.join("\n\n"));
  }

  const modifiedPrompt = substituteDirectives(prompt, directives, resolvedMap);

  output.hookSpecificOutput = {
    hookEventName: "UserPromptSubmit",
    additionalContext: contextParts.join("\n\n"),
    ...(modifiedPrompt ? { modifiedPrompt } : {}),
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch(() => process.exit(0));
