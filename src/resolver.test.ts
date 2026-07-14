import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discoverElements, resolveSections, resolve } from "./resolver.js";
import { scan } from "./scanner.js";

describe("Resolver", () => {
  const elements = discoverElements();

  it("discovers elements from ~/.cue/elements/", () => {
    assert.ok(elements.has("answer"), "should discover 'answer' element");
    assert.ok(
      elements.has("claude-api"),
      "should discover 'claude-api' element"
    );
    assert.ok(elements.has("docx"), "should discover 'docx' element");
  });

  it("discovers namespaced elements", () => {
    assert.ok(
      elements.has("maikel-479/answer"),
      "should discover 'maikel-479/answer'"
    );
    assert.ok(
      elements.has("anthropic/claude-api"),
      "should discover 'anthropic/claude-api'"
    );
  });

  describe("section tracing", () => {
    it("traces a single tag section", () => {
      const answer = elements.get("answer")!;
      const ranges = resolveSections(answer, ["Investigate"]);
      assert.equal(ranges.length, 2); // Default + Investigate
      assert.equal(ranges[0].tag, "default");
      assert.equal(ranges[1].tag, "Investigate");
    });

    it("traces composed tags independently", () => {
      const answer = elements.get("answer")!;
      const ranges = resolveSections(answer, ["Investigate", "Lean"]);
      assert.equal(ranges.length, 3); // Default + Investigate + Lean
      assert.equal(ranges[1].tag, "Investigate");
      assert.equal(ranges[2].tag, "Lean");
    });

    it("traces only requested tags, not all", () => {
      const claudeApi = elements.get("claude-api")!;
      const ranges = resolveSections(claudeApi, ["Python"]);
      assert.equal(ranges.length, 2); // Default + Python only
      assert.equal(ranges[1].tag, "Python");
      // Go, TypeScript, Ruby, Curl, Migrate should NOT be traced
      const allTags = ranges.map((r) => r.tag);
      assert.ok(!allTags.includes("Go"));
      assert.ok(!allTags.includes("TypeScript"));
      assert.ok(!allTags.includes("Ruby"));
      assert.ok(!allTags.includes("Curl"));
      assert.ok(!allTags.includes("Migrate"));
    });
  });

  describe("full resolve", () => {
    it("resolves [Answer: Investigate > Lean]", () => {
      const directives = scan("[Answer: Investigate > Lean]");
      const result = resolve(directives[0], elements);
      assert.ok(result, "should resolve");
      assert.ok(result.text.includes("Default Behavior"));
      assert.ok(result.text.includes("Tag: Investigate"));
      assert.ok(result.text.includes("Tag: Lean"));
      assert.ok(!result.text.includes("Tag: NoSlop"));
      assert.ok(!result.text.includes("Tag: Act"));
    });

    it("resolves [ClaudeApi: Python > Migrate] with tag composition", () => {
      const directives = scan("[ClaudeApi: Python > Migrate]");
      const result = resolve(directives[0], elements);
      assert.ok(result, "should resolve");
      assert.ok(result.text.includes("Default Behavior"));
      assert.ok(result.text.includes("Tag: Python"));
      assert.ok(result.text.includes("Tag: Migrate"));
      assert.ok(!result.text.includes("Tag: Go"));
      assert.ok(!result.text.includes("Tag: TypeScript"));
    });

    it("resolves [Docx: Create] single tag", () => {
      const directives = scan("[Docx: Create]");
      const result = resolve(directives[0], elements);
      assert.ok(result, "should resolve");
      assert.ok(result.text.includes("Default Behavior"));
      assert.ok(result.text.includes("Tag: Create"));
      // Check that the Edit section body content is NOT included
      // (the string "Tag: Edit" appears as a cross-reference in Default, which is fine)
      assert.ok(
        !result.text.includes("Follow all 3 steps in order"),
        "should not include Edit section body"
      );
      assert.ok(
        !result.text.includes("Text extraction with tracked changes"),
        "should not include Read section body"
      );
    });

    it("returns null for unknown element", () => {
      const directives = scan("[Unknown: Foo]");
      const result = resolve(directives[0], elements);
      assert.equal(result, null);
    });

    it("resolves a default-only directive [Answer]", () => {
      const directives = scan("[Answer]");
      const result = resolve(directives[0], elements);
      assert.ok(result, "should resolve");
      assert.ok(result.text.includes("Default Behavior"));
    });
  });
});
