import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scan, scanSysnav } from "./scanner.js";

describe("Scanner", () => {
  describe("directive parsing", () => {
    it("finds a simple directive", () => {
      const directives = scan("[Answer]");
      assert.equal(directives.length, 1);
      assert.equal(directives[0].element, "Answer");
      assert.equal(directives[0].tags.length, 0);
    });

    it("finds a directive with one tag", () => {
      const directives = scan("[Answer: Human]");
      assert.equal(directives.length, 1);
      assert.equal(directives[0].element, "Answer");
      assert.deepEqual(directives[0].tags, ["Human"]);
    });

    it("finds a directive with composed tags", () => {
      const directives = scan("[Answer: Human > Brief > Technical]");
      assert.equal(directives.length, 1);
      assert.deepEqual(directives[0].tags, ["Human", "Brief", "Technical"]);
    });

    it("finds a scoped directive", () => {
      const directives = scan("[Answer: Technical]{@src/foo.rs}");
      assert.equal(directives.length, 1);
      assert.equal(directives[0].scope?.type, "file");
      assert.equal(directives[0].scope?.value, "src/foo.rs");
      assert.equal(directives[0].scope?.mode, "augment");
    });

    it("finds a scoped directive with replace mode", () => {
      const directives = scan("[Translate: Natural]{@README.md:replace}");
      assert.equal(directives.length, 1);
      assert.equal(directives[0].scope?.mode, "replace");
    });

    it("finds multiple directives in one prompt", () => {
      const prompt =
        "[Answer: Technical]{@src/foo.rs}\n[Answer: Human]{@src/bar.rs}";
      const directives = scan(prompt);
      assert.equal(directives.length, 2);
      assert.equal(directives[0].scope?.value, "src/foo.rs");
      assert.equal(directives[1].scope?.value, "src/bar.rs");
    });

    it("finds a glob-scoped directive", () => {
      const directives = scan("[Summarize: Brief]{@src/**/*.rs}");
      assert.equal(directives.length, 1);
      assert.equal(directives[0].scope?.type, "glob");
      assert.equal(directives[0].scope?.value, "src/**/*.rs");
    });

    it("finds an id-scoped directive", () => {
      const directives = scan("[Answer: Technical]{#my-block}");
      assert.equal(directives.length, 1);
      assert.equal(directives[0].scope?.type, "id");
      assert.equal(directives[0].scope?.value, "my-block");
    });

    it("finds a $last-scoped directive", () => {
      const directives = scan("[Answer: Technical]{$last}");
      assert.equal(directives.length, 1);
      assert.equal(directives[0].scope?.type, "last");
    });
  });

  describe("fenced code block skipping (edge case 1)", () => {
    it("does NOT scan directives inside fenced code blocks", () => {
      const prompt = `Here is an example:
\`\`\`
[Answer: Human]
This is inside a code block.
\`\`\`
Now use [Answer: Technical] for real.`;
      const directives = scan(prompt);
      assert.equal(directives.length, 1);
      assert.equal(directives[0].element, "Answer");
      assert.deepEqual(directives[0].tags, ["Technical"]);
    });

    it("does NOT scan directives inside tilde-fenced blocks", () => {
      const prompt = `~~~
[Answer: Human]
~~~
[Answer: Brief]`;
      const directives = scan(prompt);
      assert.equal(directives.length, 1);
      assert.equal(directives[0].tags[0], "Brief");
    });

    it("scans directives both before and after fenced blocks", () => {
      const prompt = `[Answer: Human]
\`\`\`
[Code: Rust]
\`\`\`
[Answer: Brief]`;
      const directives = scan(prompt);
      assert.equal(directives.length, 2);
      assert.equal(directives[0].tags[0], "Human");
      assert.equal(directives[1].tags[0], "Brief");
    });

    it("handles nested fences correctly", () => {
      const prompt = `Text before
\`\`\`
code with [Answer: Human] inside
\`\`\`
Text after [Answer: Brief]`;
      const directives = scan(prompt);
      assert.equal(directives.length, 1);
      assert.equal(directives[0].tags[0], "Brief");
    });
  });

  describe("inline code span skipping (backtick escape hatch)", () => {
    it("does NOT scan directives inside single backtick spans", () => {
      const prompt = "Use `[Answer: NoSlop]` for terse output. Then do [Answer: Lean].";
      const directives = scan(prompt);
      assert.equal(directives.length, 1);
      assert.equal(directives[0].tags[0], "Lean");
    });

    it("handles multiple inline code spans on one line", () => {
      const prompt = "See `[Answer: A]` and `[Answer: B]` but do [Answer: C].";
      const directives = scan(prompt);
      assert.equal(directives.length, 1);
      assert.equal(directives[0].tags[0], "C");
    });

    it("handles mix of inline code and fenced blocks", () => {
      const prompt = "Use `[Answer: A]` and:\n```\n[Answer: B]\n```\nReal: [Answer: C]";
      const directives = scan(prompt);
      assert.equal(directives.length, 1);
      assert.equal(directives[0].tags[0], "C");
    });
  });

  describe("system nav", () => {
    it("detects message-initial colon", () => {
      assert.equal(scanSysnav(":mode plan"), ":mode plan");
    });

    it("detects chained sysnav", () => {
      assert.equal(scanSysnav(":status; :cost"), ":status; :cost");
    });

    it("does NOT detect colon mid-message", () => {
      assert.equal(scanSysnav("Use :mode plan please"), null);
    });

    it("does NOT detect colon in non-initial position", () => {
      assert.equal(scanSysnav("  :mode plan"), ":mode plan");
    });
  });
});
