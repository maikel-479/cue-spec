#!/usr/bin/env node

import { scan, scanSysnav } from "./scanner.js";
import { discoverElements, resolve } from "./resolver.js";
import { HookInput, HookOutput } from "./types.js";

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
  const injections: string[] = [];
  const errors: string[] = [];

  for (const directive of directives) {
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

  output.hookSpecificOutput = {
    hookEventName: "UserPromptSubmit",
    additionalContext: contextParts.join("\n\n"),
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch(() => process.exit(0));
