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

## Getting Started

The fastest way to get started is with the `init` command, which scaffolds a complete project structure:

```bash
md-xformer init
```

This creates:

```txt
.md-xformer/
  templates/
    h2.template.html
    h3.template.html
    p.template.html
    codeblock.template.html
articles/
  sample.md
```

Then run the transformer:

```bash
md-xformer articles -t .md-xformer/templates -o dist
```

Your transformed HTML will be in `dist/articles/sample.html`.

### Init Options

```bash
md-xformer init [--preset <name>] [--dir <path>] [--force] [--dry-run]
```

- `--preset <name>` — Choose scaffold preset:
  - `example` (default): Standard templates for common elements
  - `generic`: Minimal template set
- `--dir <path>` — Target directory (defaults to current directory)
- `--force` — Overwrite existing files
- `--dry-run` — Preview what would be created without writing files

**Examples:**

```bash
# Initialize with example preset (default)
md-xformer init

# Initialize with minimal generic preset
md-xformer init --preset generic

# Preview what would be created
md-xformer init --dry-run

# Initialize in a specific directory
md-xformer init --dir my-project

# Overwrite existing files
md-xformer init --force
```

## Usage

### Transform Command (One-time Build)

```bash
md-xformer <input> -o <outDir> [-t <templateDir>] [--ext html] [--clean] [--dry-run] [--verbose] [--allow-html]
```

**Example:**

```bash
md-xformer articles \
  -t template \
  -o dist
```

- `articles` — Markdown file or directory
- `template` — Directory containing HTML templates (must exist)
- `dist` — Output directory

### Watch Command (Auto-rebuild on Changes)

The `watch` command monitors your Markdown files, templates, and assets, automatically rebuilding when changes are detected.

```bash
md-xformer watch <input> [-t <templateDir>] [-o <outDir>] [options]
```

**Options:**

- `-t, --template <dir>` — Template directory (default: `.md-xformer/templates`)
- `-o, --out <path>` — Output directory (required)
- `--dir <path>` — Working directory (default: current directory)
- `--include <glob>` — Additional watch patterns (repeatable)
- `--ignore <glob>` — Ignore patterns (repeatable)
- `--debounce <ms>` — Debounce interval in milliseconds (default: 200)
- `--once` — Run a single build then exit (useful for testing)
- `--verbose` — Show detailed logs
- `--allow-html` — Allow raw HTML in Markdown input

**Examples:**

```bash
# Watch all articles and rebuild on changes
md-xformer watch articles -t .md-xformer/templates -o dist

# Watch a single file
md-xformer watch articles/post.md -t .md-xformer/templates -o dist

# Watch with custom debounce and verbose output
md-xformer watch articles -t .md-xformer/templates -o dist --debounce 500 --verbose

# Watch additional files (e.g., custom CSS/assets)
md-xformer watch articles -t .md-xformer/templates -o dist --include "assets/**/*.css"
```

**What gets watched:**

By default, the watch command monitors:
- All `.md` files in the input directory (or the specific input file)
- All `.html` template files in the template directory
- All `.css` files in the template directory
- Any additional patterns specified with `--include`

**What gets ignored:**

By default, these patterns are ignored to prevent rebuild loops:
- `node_modules/**`
- `dist/**`
- `.git/**`
- The output directory specified with `-o`
- Any additional patterns specified with `--ignore`

**Keyboard shortcuts:**

- `Ctrl+C` — Stop watching and exit gracefully

## Template Structure

Templates are matched to Markdown elements **by filename**.

```txt
template/
├── h1.template.html
├── h2.template.html
├── h3.template.html
├── codeblock.template.html
└── p.template.html
```

> **Tip:** Run `md-xformer init` to generate a starter set of templates automatically.

### Customizing Templates

After running `md-xformer init`, you can customize templates in `.md-xformer/templates/`:

1. Edit any `.template.html` file to change the HTML structure
2. Add new template files for other elements (e.g., `h4.template.html`, `blockquote.template.html`)

### Example: `h2.template.html`

```html
<h2 id="{{ id }}">{{ h2 }}</h2>
```

Template variables for headings:

- `{{ h1 }}`, `{{ h2 }}`, `{{ h3 }}`, etc. — Inner text or HTML for each heading level
- `{{ id }}` — Slugified heading ID

Template variables for other elements:

- `{{ p }}` — Inner text or HTML for paragraphs

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
