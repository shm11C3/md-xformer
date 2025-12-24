import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  return {
    renderToken: vi.fn((tokens: any[], idx: number) => {
      return `[${tokens[idx].type}]`;
    }),
  };
});

describe("transformMarkdownToHtml (internal fallback branches)", () => {
  it("covers defaultRenderToken fallback and non-inline branches", async () => {
    vi.resetModules();

    vi.mock("markdown-it", () => {
      const { renderToken } = hoisted;
      class MarkdownIt {
        options: any;
        renderer: any;
        utils: any;

        constructor(opts: any = {}) {
          this.options = opts;
          this.utils = {
            escapeHtml: (s: string) =>
              s
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;"),
          };
          this.renderer = {
            rules: {},
            renderToken,
            renderInline: () => "INLINE",
          };
        }

        parse() {
          return [
            // inline token with children undefined -> hits `inline.children ?? []`
            { type: "heading_open", tag: "h2" },
            { type: "inline", children: undefined },
            { type: "heading_close", tag: "h2" },

            // next token is not inline -> hits non-inline branch
            { type: "heading_open", tag: "h3" },
            { type: "heading_close", tag: "h3" },

            // inline token with children undefined -> hits `inline.children ?? []`
            { type: "paragraph_open", tag: "p" },
            { type: "inline", children: undefined },
            { type: "paragraph_close", tag: "p" },

            // next token is not inline -> hits non-inline branch
            { type: "paragraph_open", tag: "p" },
            { type: "paragraph_close", tag: "p" },

            { type: "mystery", tag: "" },
          ];
        }
      }

      return { default: MarkdownIt };
    });

    const { transformMarkdownToHtml } = await import("../../src/transform.js");

    const html = transformMarkdownToHtml("irrelevant", new Map());

    expect(hoisted.renderToken).toHaveBeenCalled();
    expect(html).toContain("<h2>INLINE</h2>");
    expect(html).toContain("[heading_open]");
    expect(html).toContain("<p>INLINE</p>");
    expect(html).toContain("[paragraph_open]");
    expect(html).toContain("[mystery]");
  });
});
