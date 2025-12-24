import { describe, expect, it, vi } from "vitest";

describe("transformMarkdownToHtml (highlight error path)", () => {
  it("falls back to escaped output when highlight.js throws", async () => {
    vi.resetModules();

    vi.mock("highlight.js", () => ({
      default: {
        getLanguage: () => true,
        highlight: () => {
          throw new Error("boom");
        },
      },
    }));

    const { transformMarkdownToHtml } = await import("../../src/transform.js");

    const html = transformMarkdownToHtml("```js\n<a>\n```\n", new Map());
    expect(html).toContain('class="hljs"');
    expect(html).toContain("&lt;a&gt;");
    expect(html).not.toContain("language-js");
  });
});
