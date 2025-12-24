import { describe, expect, it } from "vitest";
import { transformMarkdownToHtml } from "../../src/transform.js";

function templates(entries: Array<[string, string]>) {
  return new Map(entries);
}

describe("transformMarkdownToHtml", () => {
  it("applies heading template with {{ id }}", () => {
    const t = templates([["h2", '<h2 id="{{ id }}">{{ h2 }}</h2>']]);

    const html = transformMarkdownToHtml("## Hello, World!\n", t);
    expect(html).toContain('<h2 id="hello-world">Hello, World!</h2>');
  });

  it("slugifies Japanese headings", () => {
    const t = templates([["h2", '<h2 id="{{ id }}">{{ h2 }}</h2>']]);

    const html = transformMarkdownToHtml("## 日本語 見出し\n", t);
    expect(html).toContain('<h2 id="日本語-見出し">日本語 見出し</h2>');
  });

  it("applies paragraph template using {{ p }}", () => {
    const t = templates([["p", '<p class="lead">{{ p }}</p>']]);

    const html = transformMarkdownToHtml("Hello **bold**\n", t);
    expect(html).toContain('<p class="lead">Hello <strong>bold</strong></p>');
  });

  it("falls back to normal tags when template is missing", () => {
    const t = templates([]);

    const html = transformMarkdownToHtml("### Title\n\nHello\n", t);
    expect(html).toContain("<h3>Title</h3>");
    expect(html).toContain("<p>Hello</p>");
  });

  it("highlights supported languages and escapes unsupported ones", () => {
    const t = templates([]);

    const js = transformMarkdownToHtml("```javascript\nconst x = 1;\n```\n", t);
    expect(js).toContain('class="hljs language-javascript"');

    const unknown = transformMarkdownToHtml("```nope\n<a>\n```\n", t);
    expect(unknown).toContain('class="hljs"');
    expect(unknown).toContain("&lt;a&gt;");
    expect(unknown).not.toContain("language-nope");
  });
});
