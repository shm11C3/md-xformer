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
        path: `${CONFIG_DIR}/templates/h2.template.html`,
        content: `<h2 id="{{ id }}">{{ h2 }}</h2>`,
      },
      {
        path: `${CONFIG_DIR}/templates/h3.template.html`,
        content: `<h3 id="{{ id }}">{{ h3 }}</h3>`,
      },
      {
        path: `${CONFIG_DIR}/templates/p.template.html`,
        content: `<p>{{ p }}</p>`,
      },
      {
        path: `${CONFIG_DIR}/templates/codeblock.template.html`,
        content: `<pre><code class="hljs language-{{ lang }}">{{{ code }}}</code></pre>`,
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
2. Run the transformer:

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
        path: `${CONFIG_DIR}/templates/h2.template.html`,
        content: `<h2 id="{{ id }}">{{ h2 }}</h2>`,
      },
      {
        path: `${CONFIG_DIR}/templates/codeblock.template.html`,
        content: `<pre><code class="hljs language-{{ lang }}">{{{ code }}}</code></pre>`,
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
  console.log("  2. Try the sample:\n");
  console.log(`     md-xformer articles -t .md-xformer/templates -o dist\n`);

  return 0;
}
