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

/**
 * Apply template with support for raw HTML injection via triple braces {{{ }}}
 * Regular {{ }} placeholders escape HTML, triple {{{ }}} inject raw HTML
 */
function applyTemplateWithRawHtml(
  templates: Templates,
  tag: string,
  vars: Record<string, string>,
  rawVars: Set<string>,
  verbose: boolean,
): string {
  const t = templates.get(tag);
  if (!t) {
    // No template available, fallback handled by caller
    return "";
  }

  let out = t;

  // First pass: replace raw HTML variables (triple braces)
  for (const key of rawVars) {
    const value = vars[key] ?? "";
    const placeholder = `{{{ ${key} }}}`;
    if (out.includes(placeholder)) {
      out = out.split(placeholder).join(value);
    } else if (verbose) {
      console.warn(
        `[warn] template "${tag}" does not include raw placeholder "{{{ ${key} }}}"`,
      );
    }
  }

  // Second pass: replace escaped variables (double braces)
  for (const [key, value] of Object.entries(vars)) {
    if (rawVars.has(key)) continue; // already handled
    const placeholder = `{{ ${key} }}`;
    const escaped = mdUtils.escapeHtml(value);
    out = out.split(placeholder).join(escaped);
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

/**
 * Custom fence renderer that supports codeblock templates
 */
function renderFence(
  tokens: Token[],
  idx: number,
  templates: Templates,
  verbose: boolean,
): string {
  const token = tokens[idx];
  const code = token.content;

  // Extract language from token.info (e.g. "typescript " -> "typescript")
  const info = token.info ? token.info.trim() : "";
  const langMatch = info.match(/^(\S+)/);
  const rawLang = langMatch ? langMatch[1] : "";

  // Normalize lang for template (default to "text" if not specified)
  const lang = rawLang || "text";

  // Check if language is supported by highlight.js
  let isSupported = false;
  let highlightedHtml = "";

  if (rawLang && hljs.getLanguage(rawLang)) {
    try {
      // Try to highlight with the language
      const result = hljs.highlight(code, {
        language: rawLang,
        ignoreIllegals: true,
      }).value;
      highlightedHtml = result;
      isSupported = true;
    } catch {
      // If highlighting fails, fall back to escaped output
      highlightedHtml = mdUtils.escapeHtml(code);
    }
  } else {
    // Language not specified or not supported
    highlightedHtml = mdUtils.escapeHtml(code);
  }

  // Try to apply codeblock template
  const template = applyTemplateWithRawHtml(
    templates,
    "codeblock",
    {
      lang,
      code: highlightedHtml,
      raw: code,
    },
    new Set(["code"]), // "code" should be injected as raw HTML
    verbose,
  );

  if (template) {
    return template;
  }

  // Fallback to default wrapper when no template exists
  // Only add language class if the language is supported and highlighting succeeded
  const langClass = isSupported ? ` language-${rawLang}` : "";
  return `<pre><code class="hljs${langClass}">${highlightedHtml}</code></pre>\n`;
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

    // fence : code blocks with ```
    if (tok.type === "fence") {
      out += renderFence(tokens, i, templates, verbose);
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
