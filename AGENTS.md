# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

md-xformer is a Node.js (>=20) ESM CLI that converts Markdown into **template-based HTML**. It allows users to replace Markdown elements (headings, code blocks, paragraphs, etc.) with custom HTML templates, enabling strict control over HTML structure and styling for CMS-driven sites, internal blogs, and WordPress.

## Key Architecture

### Data Flow
CLI collects `*.md` files → loads templates → transforms Markdown tokens to HTML → writes mirrored outputs

### Core Modules
- **Entry:** `src/cli.ts` - Argument parsing, file traversal, output emission
- **IO:** `src/io.ts` - `collectMarkdownFiles()`, `toOutPath()`, directory operations
- **Templates:** `src/templates.ts` - Loads `*.template.html` files into a `Map<string, string>`
- **Transform:** `src/transform.ts` - markdown-it renderer + highlight.js + template application
- **Init:** `src/init.ts` - Scaffolding command for generating starter templates

### Template System
- **Discovery:** Filename-based, **non-recursive**. Only files matching `*.template.html` in the template directory are loaded
- **Keys:** Template filenames are lowercased (`H1.template.html` → `h1`)
- **Variables:**
  - Headings (`h1`-`h6`): `{{ h2 }}` (rendered HTML), `{{ id }}` (slugified id, Japanese-safe)
  - Paragraphs (`p`): `{{ p }}` (rendered inline HTML)
  - Code blocks (`codeblock`): `{{ lang }}`, `{{ raw }}` (escaped), `{{{ code }}}` (highlighted HTML, raw injection via triple braces)
- **Escaping:** Double braces `{{ }}` escape HTML; triple braces `{{{ }}}` inject raw HTML

### HTML Safety
- Markdown raw HTML is **escaped by default**
- Only enabled via `--allow-html` CLI flag or `{ allowHtml: true }` transform option

## Development Commands

```bash
# Build the CLI (tsup → dist/cli.js with shebang)
npm run build

# Run the built CLI locally
npm run dev -- <args>

# Run all tests (unit + e2e)
npm test

# Run unit tests only (Vitest + coverage)
npm run test:unit

# Run e2e tests only (builds first, spawns CLI)
npm run test:e2e

# Type checking
npm run typecheck

# Lint (Biome: 2-space indent, double quotes)
npm run lint

# Format code
npm run format
```

## Important Conventions

### ESM Imports
- TypeScript imports use `.js` extensions (e.g., `./transform.js`) to match emitted ESM
- Keep this pattern when adding new files

### File Skipping
- `collectMarkdownFiles()` intentionally skips `node_modules/`, `.git/`, and `dist/` during directory walks

### Transform Behavior
- Keep transform logic aligned with tests in `tests/unit/*`
- CLI behavior must align with `tests/e2e/cli.e2e.test.ts`

### Slugification
- `slugify()` in `src/transform.ts` preserves Japanese characters (`\u3000-\u9fff`)
- Pattern: lowercase, trim, replace non-word/non-Japanese with `-`, dedupe `-`, strip leading/trailing `-`

## CI Requirements

- CI runs lint, typecheck+build, unit tests, and e2e tests (Node 20 & 24)
- See `.github/workflows/ci.yml`
- Merge gate job (`merge-gate.ts`) fails if any required job is not `success` or `skipped`

## Template Variable Reference

From `.github/copilot-instructions.md`:
- Headings: `{{ h2 }}` (rendered inline HTML), `{{ id }}` (slugified heading id)
- Paragraphs: `{{ p }}` (rendered inline HTML)
- Code blocks:
  - `{{ lang }}` - Language name (defaults to `text`)
  - `{{{ code }}}` - Highlighted HTML from highlight.js (raw, use triple braces)
  - `{{ raw }}` - Original code as escaped text
