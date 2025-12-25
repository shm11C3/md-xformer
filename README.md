# md-xformer

A CLI tool that converts Markdown into **template-based HTML**.

Most Markdown tools stop at “Markdown → HTML”.
md-xformer goes one step further:  
it lets you **replace Markdown elements (headings, code blocks, etc.) with your own HTML templates**.

This tool is designed for cases where **HTML structure and styling must be strictly controlled**, such as internal blogs or CMS-driven sites.

> [!WARNING]
> This is a work-in-progress project. Use at your own risk.

## Features

- Convert Markdown to HTML
- Replace Markdown elements using **HTML templates**
- Syntax highlighting via `highlight.js`
- Output HTML ready to paste into:
  - WordPress
  - Internal CMS
  - Static sites

## When to Use

md-xformer is a good fit if:

- You want to write in Markdown but **enforce a fixed HTML structure**
- Your organization has strict design or markup rules
- You need build-time HTML output

It is **not** a good fit if:

- You want live Markdown rendering in the browser
- You need MDX / React integration
- You want a full static site generator

## Installation

```bash
npm install -g md-xformer
```

Or run without installing:

```bash
npx md-xformer --help
```

## Usage

```bash
md-xformer <input> -o <outDir> [-t <templateDir>] [--ext html] [--clean] [--dry-run] [--verbose]
```

### Example

```bash
md-xformer articles \
  -t template \
  -o dist
```

- `articles` — Markdown file or directory
- `template` — Directory containing HTML templates (must exist)
- `dist` — Output directory

## Template Structure

Templates are matched to Markdown elements **by filename**.

```txt
template/
├── h1.template.html
├── h2.template.html
├── h3.template.html
├── codeblock.template.html
├── document.template.html # in progress 
└── p.template.html
```

### Example: `h2.template.html`

```html
<h2 id="{{ id }}">{{ h2 }}</h2>
```

Common template variables:

- `{{ content }}` — Inner text or HTML (for most elements)
- `{{ id }}` — Slugified heading ID (for headings)

### Example: `codeblock.template.html`

You can customize the HTML wrapper for fenced code blocks:

```html
<pre class="code-block">
  <div class="code-block__meta">
    <span class="code-block__lang">{{ lang }}</span>
  </div>
  <code class="hljs language-{{ lang }}">{{{ code }}}</code>
</pre>
```

**Available variables:**

- `{{ lang }}` — Language name (e.g., `typescript`, `python`, or `text` if not specified)
- `{{{ code }}}` — Highlighted HTML from highlight.js (**raw HTML**, use triple braces)
- `{{ raw }}` — Original code as escaped text (safe for display)

**Important:** Use triple braces `{{{ code }}}` to inject the highlighted HTML without escaping. Regular double braces `{{ }}` will escape HTML entities.

If no `codeblock.template.html` is provided, the default wrapper is used:

```html
<pre><code class="hljs language-{lang}">...</code></pre>
```

## Syntax Highlighting

- Powered by `highlight.js`
- Language-specified code blocks are highlighted automatically
- Unsupported or unspecified languages are safely escaped

````md
```ts
const x: number = 1;
```
````

## Design Principles

- Use `markdown-it` directly
- No magic, no hidden conventions
- CLI + templates only
- CMS-agnostic (WordPress support is handled via templates)

## License

[MIT License](LICENSE)
