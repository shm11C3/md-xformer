import fs from "node:fs/promises";
import path from "node:path";

export type InitOptions = {
  preset: string;
  dir: string;
  force: boolean;
  dryRun: boolean;
};

type ScaffoldFile = {
  path: string;
  content: string;
};

type Preset = {
  name: string;
  files: ScaffoldFile[];
};

// Default config directory name
const CONFIG_DIR = ".md-xformer";

// Scaffold presets
const PRESETS: Record<string, Preset> = {
  wordpress: {
    name: "wordpress",
    files: [
      {
        path: `${CONFIG_DIR}/templates/document.template.html`,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <style>
{{{ css }}}
  </style>
</head>
<body>
  <article class="wp-content">
{{{ body }}}
  </article>
</body>
</html>`,
      },
      {
        path: `${CONFIG_DIR}/templates/h2.template.html`,
        content: `<h2 id="{{ id }}" class="wp-heading">{{ h2 }}</h2>`,
      },
      {
        path: `${CONFIG_DIR}/templates/h3.template.html`,
        content: `<h3 id="{{ id }}" class="wp-heading">{{ h3 }}</h3>`,
      },
      {
        path: `${CONFIG_DIR}/templates/toc.template.html`,
        content: `<div class="wp-toc">
  <h2 class="wp-toc__title">Table of Contents</h2>
  <nav class="wp-toc__nav">
{{{ toc }}}
  </nav>
</div>`,
      },
      {
        path: `${CONFIG_DIR}/templates/p.template.html`,
        content: `<p class="wp-paragraph">{{ p }}</p>`,
      },
      {
        path: `${CONFIG_DIR}/templates/codeblock.template.html`,
        content: `<div class="wp-code-block">
  <div class="wp-code-block__header">
    <span class="wp-code-block__lang">{{ lang }}</span>
  </div>
  <pre class="wp-code-block__content"><code class="hljs language-{{ lang }}">{{{ code }}}</code></pre>
</div>`,
      },
      {
        path: `${CONFIG_DIR}/assets/template.css`,
        content: `/* WordPress-friendly styles */
.wp-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: #333;
}

.wp-heading {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-weight: 600;
  line-height: 1.3;
}

.wp-paragraph {
  margin-bottom: 1em;
}

.wp-toc {
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 20px;
  margin: 20px 0;
}

.wp-toc__title {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1.2em;
}

.wp-toc__nav ul {
  list-style: none;
  padding-left: 0;
}

.wp-toc__nav li {
  margin: 5px 0;
}

.wp-code-block {
  margin: 20px 0;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  overflow: hidden;
}

.wp-code-block__header {
  background: #f6f8fa;
  padding: 8px 12px;
  border-bottom: 1px solid #e1e4e8;
  font-size: 12px;
  font-weight: 600;
  color: #586069;
}

.wp-code-block__lang {
  text-transform: uppercase;
}

.wp-code-block__content {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  background: #ffffff;
}

.wp-code-block__content code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 14px;
  line-height: 1.5;
}

/* highlight.js base styles */
.hljs {
  display: block;
  overflow-x: auto;
  color: #24292e;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-subst {
  color: #d73a49;
}

.hljs-string,
.hljs-attr,
.hljs-symbol,
.hljs-bullet,
.hljs-addition {
  color: #032f62;
}

.hljs-title,
.hljs-section,
.hljs-attribute {
  color: #6f42c1;
}

.hljs-variable,
.hljs-template-variable {
  color: #e36209;
}

.hljs-comment,
.hljs-quote {
  color: #6a737d;
  font-style: italic;
}

.hljs-number,
.hljs-literal {
  color: #005cc5;
}

.hljs-meta {
  color: #d73a49;
}

.hljs-built_in {
  color: #005cc5;
}
`,
      },
      {
        path: "articles/sample.md",
        content: `# Sample Article

This is a sample Markdown document to help you get started with md-xformer.

## Introduction

md-xformer converts Markdown into template-based HTML. You can customize every HTML element using templates.

### Features

- **Template-based rendering**: Replace Markdown elements with your own HTML
- **Syntax highlighting**: Automatic code highlighting with highlight.js
- **WordPress-friendly**: Output ready to paste into WordPress or other CMS

## Code Examples

Here's a JavaScript code block:

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}

greet("World");
\`\`\`

And a Python example:

\`\`\`python
def calculate_sum(a, b):
    return a + b

result = calculate_sum(10, 20)
print(f"Result: {result}")
\`\`\`

## Next Steps

1. Edit the templates in \`.md-xformer/templates/\`
2. Customize the CSS in \`.md-xformer/assets/template.css\`
3. Run the transformer:

\`\`\`bash
md-xformer articles -t .md-xformer/templates -o dist
\`\`\`

Happy writing! ✨
`,
      },
    ],
  },
  generic: {
    name: "generic",
    files: [
      {
        path: `${CONFIG_DIR}/templates/document.template.html`,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <style>
{{{ css }}}
  </style>
</head>
<body>
{{{ body }}}
</body>
</html>`,
      },
      {
        path: `${CONFIG_DIR}/templates/h2.template.html`,
        content: `<h2 id="{{ id }}">{{ h2 }}</h2>`,
      },
      {
        path: `${CONFIG_DIR}/templates/toc.template.html`,
        content: `<nav class="toc">
{{{ toc }}}
</nav>`,
      },
      {
        path: `${CONFIG_DIR}/assets/template.css`,
        content: `/* Minimal base styles */
body {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: system-ui, sans-serif;
  line-height: 1.6;
}

pre {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
}

code {
  font-family: monospace;
}

/* highlight.js minimal styles */
.hljs {
  display: block;
  overflow-x: auto;
}

.hljs-keyword { color: #0000ff; }
.hljs-string { color: #a31515; }
.hljs-comment { color: #008000; font-style: italic; }
.hljs-number { color: #098658; }
`,
      },
      {
        path: "articles/sample.md",
        content: `# Getting Started

This is a minimal sample document.

## Code Example

\`\`\`javascript
console.log("Hello, World!");
\`\`\`

## Next Steps

Run: \`md-xformer articles -t .md-xformer/templates -o dist\`
`,
      },
    ],
  },
};

function getPreset(name: string): Preset | null {
  return PRESETS[name] || null;
}

export function listPresets(): string[] {
  return Object.keys(PRESETS);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeFileIfNeeded(
  filePath: string,
  content: string,
  force: boolean,
  dryRun: boolean,
): Promise<{ written: boolean; existed: boolean }> {
  const existed = await fileExists(filePath);

  if (existed && !force) {
    return { written: false, existed: true };
  }

  if (dryRun) {
    return { written: false, existed };
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Write file
  await fs.writeFile(filePath, content, "utf-8");

  return { written: true, existed };
}

export async function runInit(opts: InitOptions): Promise<number> {
  const preset = getPreset(opts.preset);
  if (!preset) {
    console.error(`ERROR: Unknown preset: ${opts.preset}`);
    console.error(`Available presets: ${listPresets().join(", ")}`);
    return 2;
  }

  const targetDir = path.resolve(process.cwd(), opts.dir);

  console.log(`Initializing md-xformer with preset: ${opts.preset}`);
  console.log(`Target directory: ${targetDir}`);

  if (opts.dryRun) {
    console.log("\n[DRY RUN] The following files would be created:\n");
  }

  const results: {
    path: string;
    written: boolean;
    existed: boolean;
  }[] = [];

  for (const file of preset.files) {
    const fullPath = path.join(targetDir, file.path);
    const result = await writeFileIfNeeded(
      fullPath,
      file.content,
      opts.force,
      opts.dryRun,
    );

    results.push({
      path: file.path,
      written: result.written,
      existed: result.existed,
    });

    if (opts.dryRun) {
      const status = result.existed ? "[exists]" : "[create]";
      console.log(`  ${status} ${file.path}`);
    }
  }

  if (opts.dryRun) {
    console.log("\nNo files were written (dry run mode).");
    return 0;
  }

  // Print summary
  const created = results.filter((r) => r.written && !r.existed);
  const overwritten = results.filter((r) => r.written && r.existed);
  const skipped = results.filter((r) => !r.written && r.existed);

  console.log("\n✓ Initialization complete!\n");

  if (created.length > 0) {
    console.log("Created files:");
    for (const r of created) {
      console.log(`  - ${r.path}`);
    }
  }

  if (overwritten.length > 0) {
    console.log("\nOverwritten files:");
    for (const r of overwritten) {
      console.log(`  - ${r.path}`);
    }
  }

  if (skipped.length > 0) {
    console.log("\nSkipped (already exists):");
    for (const r of skipped) {
      console.log(`  - ${r.path}`);
    }
    console.log("\nℹ Use --force to overwrite existing files.");
  }

  // Refuse to continue if some files were skipped without force
  if (skipped.length > 0 && !opts.force) {
    console.log("\n⚠ Some files already exist. Use --force to overwrite.");
    return 3;
  }

  // Print next steps
  console.log("\n📝 Next steps:\n");
  console.log("  1. Customize templates in .md-xformer/templates/");
  console.log("  2. Edit CSS in .md-xformer/assets/template.css");
  console.log("  3. Try the sample:\n");
  console.log(`     md-xformer articles -t .md-xformer/templates -o dist\n`);

  return 0;
}
