import { describe, expect, it, vi } from "vitest";
import { transformMarkdownToHtml } from "../../src/transform.js";

function templates(entries: Array<[string, string]>) {
  return new Map(entries);
}

describe("transformMarkdownToHtml (verbose warnings)", () => {
  it("warns when paragraph template misses {{ p }}", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const t = templates([["p", "<p>No placeholder</p>"]]);
    const html = transformMarkdownToHtml("Hello\n", t, { verbose: true });

    expect(warn).toHaveBeenCalled();
    expect(html).toContain("<p>No placeholder</p>");

    warn.mockRestore();
  });

  it("warns when heading template misses placeholders", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const t = templates([
      [
        "h2",
        // includes {{ h2 }} but does NOT include {{ id }}
        '<h2 class="x">{{ h2 }}</h2>',
      ],
    ]);

    const html = transformMarkdownToHtml("## Hello\n", t, { verbose: true });
    expect(warn).toHaveBeenCalled();
    expect(html).toContain('<h2 class="x">Hello</h2>');

    warn.mockRestore();
  });
});
