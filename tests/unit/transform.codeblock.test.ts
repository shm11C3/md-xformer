import { describe, expect, it } from "vitest";
import { transformMarkdownToHtml } from "../../src/transform.js";

function templates(entries: Array<[string, string]>) {
  return new Map(entries);
}

describe("transformMarkdownToHtml - codeblock templates", () => {
  it("extracts language from fence info", () => {
    const t = templates([
      [
        "codeblock",
        '<pre class="custom"><span>{{ lang }}</span><code>{{{ code }}}</code></pre>',
      ],
    ]);

    const html = transformMarkdownToHtml(
      "```typescript\nconst x = 1;\n```\n",
      t,
    );
    expect(html).toContain("<span>typescript</span>");
  });

  it("defaults to 'text' when no language specified", () => {
    const t = templates([
      [
        "codeblock",
        '<pre class="custom"><span>{{ lang }}</span><code>{{{ code }}}</code></pre>',
      ],
    ]);

    const html = transformMarkdownToHtml("```\nplain code\n```\n", t);
    expect(html).toContain("<span>text</span>");
  });

  it("injects highlighted HTML without escaping via {{{ code }}}", () => {
    const t = templates([
      ["codeblock", '<div class="code-wrapper">{{{ code }}}</div>'],
    ]);

    const html = transformMarkdownToHtml(
      "```javascript\nconst x = 1;\n```\n",
      t,
    );
    // Should contain raw HTML from highlight.js with span elements
    expect(html).toContain("<span");
    expect(html).toContain("class=");
    expect(html).not.toContain("&lt;span");
  });

  it("escapes raw code via {{ raw }}", () => {
    const t = templates([["codeblock", "<pre><code>{{ raw }}</code></pre>"]]);

    const html = transformMarkdownToHtml(
      "```\n<script>alert('xss')</script>\n```\n",
      t,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("supports multiple variables in template", () => {
    const t = templates([
      [
        "codeblock",
        '<pre class="code-block"><div class="meta">Lang: {{ lang }}</div><code class="hljs language-{{ lang }}">{{{ code }}}</code></pre>',
      ],
    ]);

    const html = transformMarkdownToHtml(
      "```python\ndef foo():\n    pass\n```\n",
      t,
    );
    expect(html).toContain('class="code-block"');
    expect(html).toContain("Lang: python");
    expect(html).toContain('class="hljs language-python"');
  });

  it("falls back to default wrapper when template is missing", () => {
    const t = templates([]); // no codeblock template

    const html = transformMarkdownToHtml(
      "```javascript\nconst x = 1;\n```\n",
      t,
    );
    expect(html).toContain("<pre><code");
    expect(html).toContain('class="hljs language-javascript"');
    expect(html).toContain("</code></pre>");
  });

  it("falls back with text class when no language and no template", () => {
    const t = templates([]);

    const html = transformMarkdownToHtml("```\nplain\n```\n", t);
    expect(html).toContain('<pre><code class="hljs">');
    expect(html).not.toContain("language-");
  });

  it("handles unsupported language gracefully", () => {
    const t = templates([["codeblock", "<pre>{{ lang }}: {{{ code }}}</pre>"]]);

    const html = transformMarkdownToHtml("```unknownlang\n<tag>\n```\n", t);
    expect(html).toContain("unknownlang:");
    // Should be escaped since highlight.js won't recognize it
    expect(html).toContain("&lt;tag&gt;");
  });

  it("preserves syntax highlighting for supported languages", () => {
    const t = templates([["codeblock", "<pre>{{{ code }}}</pre>"]]);

    const html = transformMarkdownToHtml(
      "```ts\nconst x: number = 1;\n```\n",
      t,
    );
    // TypeScript highlighting should work
    expect(html).toContain("<span");
    expect(html).toContain("class=");
  });

  it("handles language with extra info", () => {
    const t = templates([
      ["codeblock", '<pre data-lang="{{ lang }}">{{{ code }}}</pre>'],
    ]);

    // markdown-it supports "```javascript {highlight: 1-3}" style
    const html = transformMarkdownToHtml(
      "```javascript {1-3}\nconst x = 1;\n```\n",
      t,
    );
    expect(html).toContain('data-lang="javascript"');
  });
});
