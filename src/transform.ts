import hljs from "highlight.js";
import MarkdownIt from "markdown-it";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Token from "markdown-it/lib/token.mjs";
import type { Templates } from "./templates.js";

type TransformOptions = {
  verbose?: boolean;
};

type MarkdownEnv = Record<string, unknown>;

const mdUtils = new MarkdownIt().utils;

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  // markdown-it calls highlight(code, lang, attrs)
  highlight(code: string, lang?: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const highlighted = hljs.highlight(code, {
          language: lang,
          ignoreIllegals: true,
        }).value;
        return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
      } catch {
        // noop
      }
    }

    // 言語指定なし or 未対応言語
    const escaped = mdUtils.escapeHtml(code);
    return `<pre><code class="hljs">${escaped}</code></pre>`;
  },
});

function applyTemplate(
  templates: Templates,
  tag: string,
  innerHtml: string,
  verbose: boolean,
): string {
  const t = templates.get(tag);
  if (!t) {
    // fallback: normal html tag
    return `<${tag}>${innerHtml}</${tag}>`;
  }
  const placeholder = `{{ ${tag} }}`;
  if (!t.includes(placeholder) && verbose) {
    console.warn(
      `[warn] template "${tag}" does not include placeholder "${placeholder}"`,
    );
  }
  return t.split(placeholder).join(innerHtml);
}

function applyTemplatePlaceholder(
  templates: Templates,
  tag: string,
  vars: Record<string, string>,
  verbose: boolean,
): string {
  const t = templates.get(tag);
  if (!t) {
    // fallback
    return `<${tag}>${vars[tag]}</${tag}>`;
  }

  let out = t;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{ ${key} }}`;
    if (!out.includes(placeholder) && verbose) {
      console.warn(
        `[warn] template "${tag}" has no placeholder "${placeholder}"`,
      );
    }
    out = out.split(placeholder).join(value);
  }

  return out;
}

function renderInline(
  renderer: Renderer,
  tokens: Token[],
  env: MarkdownEnv,
): string {
  // markdown-it provides renderer.renderInline(tokens, options, env)
  return renderer.renderInline(tokens, md.options, env);
}

function defaultRenderToken(
  renderer: Renderer,
  tokens: Token[],
  idx: number,
  env: MarkdownEnv,
): string {
  const token = tokens[idx];
  const rule = renderer.rules[token.type];
  if (rule) return rule(tokens, idx, md.options, env, renderer);
  return renderer.renderToken(tokens, idx, md.options);
}

export function transformMarkdownToHtml(
  markdown: string,
  templates: Templates,
  opts: TransformOptions = {},
): string {
  const env: MarkdownEnv = {};
  const tokens = md.parse(markdown, env);
  const r = md.renderer;
  const verbose = Boolean(opts.verbose);

  let out = "";

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // h1/h2/h3... : heading_open -> inline -> heading_close
    if (tok.type === "heading_open") {
      const tag = tok.tag.toLowerCase(); // h1, h2, ...
      const inline = tokens[i + 1];
      if (!inline || inline.type !== "inline") {
        out += defaultRenderToken(r, tokens, i, env);
        continue;
      }

      const inner = renderInline(r, inline.children ?? [], env);
      const id = slugify(inner);

      out += applyTemplatePlaceholder(
        templates,
        tag,
        {
          [tag]: inner, // {{ h2 }}
          id, // {{ id }}
        },
        verbose,
      );

      i += 2;
      continue;
    }

    // p : paragraph_open -> inline -> paragraph_close
    if (tok.type === "paragraph_open") {
      const tag = "p";
      const inline = tokens[i + 1];
      if (!inline || inline.type !== "inline") {
        out += defaultRenderToken(r, tokens, i, env);
        continue;
      }

      const inner = renderInline(r, inline.children ?? [], env);
      out += applyTemplate(templates, tag, inner, verbose);

      i += 2;
      continue;
    }

    // everything else: let markdown-it render as usual
    out += defaultRenderToken(r, tokens, i, env);
  }

  return out;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u3000-\u9fff]+/g, "-") // 日本語OK
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
