# Copilot instructions (md-xformer)

## Big picture
- This repo is a Node.js (>=20) ESM CLI that converts Markdown into template-based HTML.
- Data flow: CLI collects *.md files → loads templates → transforms Markdown tokens to HTML → writes mirrored outputs.
  - Entry: `src/cli.ts` (arg parsing, traversal, emit)
  - IO helpers: `src/io.ts` (collectMarkdownFiles, toOutPath)
  - Templates: `src/templates.ts` (loads `*.template.html` into `Map`)
  - Transform: `src/transform.ts` (markdown-it renderer + highlight.js + template application)

## Key conventions (project-specific)
- ESM imports in TS use `.js` extensions (e.g. `./transform.js`) to match emitted ESM; keep this pattern when adding files.
- Template discovery is filename-based and **non-recursive**: only files like `h2.template.html` in the template dir are loaded.
- Template keys are lowercased (`H1.template.html` → `h1`).
- `document.template.html` is mentioned in `README.md`, but the current implementation does not apply a “document wrapper” template yet (the output is a concatenation of rendered blocks). If you implement it, it likely belongs in `src/transform.ts` (wrap final `out`) and/or `src/cli.ts`.

## Template variables & escaping rules
- Headings: `heading_open` → apply template for `h1`/`h2`/… with placeholders:
  - `{{ h2 }}` etc: rendered inline HTML
  - `{{ id }}`: slugified heading id (Japanese preserved)
- Paragraphs: template `p` uses `{{ p }}` with rendered inline HTML.
- Code blocks: template key `codeblock` supports:
  - `{{ lang }}`: language (defaults to `text`)
  - `{{ raw }}`: original code (escaped when injected via `{{ raw }}`)
  - `{{{ code }}}`: highlighted HTML from highlight.js (raw injection; triple braces)
- Markdown raw HTML is escaped by default; only allow with CLI flag `--allow-html` / transform option `{ allowHtml: true }`.

## Workflows (local)
- Build CLI: `npm run build` (tsup → `dist/cli.js` with shebang)
- Run built CLI: `npm run dev -- <args>` (runs `node dist/cli.js`)
- Unit tests: `npm run test:unit` (Vitest + coverage to `coverage/`)
- E2E tests: `npm run test:e2e` (builds first; spawns `node dist/cli.js`)
- Typecheck: `npm run typecheck`
- Lint/format: `npm run lint` / `npm run format` (Biome; 2-space indent, double quotes)

## CI expectations
- CI runs lint, typecheck+build, unit tests, and e2e tests (Node 20 & 24). See `.github/workflows/ci.yml`.
- The “merge gate” job fails the workflow if any required job is not `success` or `skipped` (see `.github/scripts/merge-gate.ts`).

## When editing code
- Keep the transform behavior aligned with tests in `tests/unit/*` and CLI behavior with `tests/e2e/cli.e2e.test.ts`.
- `collectMarkdownFiles()` intentionally skips `node_modules/`, `.git/`, and `dist/` during directory walks.
