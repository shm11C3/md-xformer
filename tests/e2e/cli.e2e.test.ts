import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

function distCliPath(): string {
  return path.resolve(process.cwd(), "dist", "cli.js");
}

async function makeTempDir(prefix: string) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeTempDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

describe("CLI (dist)", () => {
  const created: string[] = [];

  afterEach(async () => {
    for (const dir of created) await removeTempDir(dir);
    created.length = 0;
  });

  it("prints help", () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const res = spawnSync(process.execPath, [cli, "--help"], {
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Usage:");
    expect(res.stdout).toContain("--allow-html");
  });

  it("runs when invoked via symlink path", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-symlink-");
    created.push(root);

    const linkPath = path.join(root, "md-xformer-symlink.js");
    await fs.symlink(cli, linkPath);

    // Run through node so argv[1] is the symlink path.
    const res = spawnSync(process.execPath, [linkPath, "--help"], {
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Usage:");
  });

  it("converts markdown directory into html output", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");
    const templateDir = path.join(root, "template");

    await fs.mkdir(path.join(inputDir, "posts"), { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    await fs.writeFile(
      path.join(templateDir, "h2.template.html"),
      '<h2 id="{{ id }}">{{ h2 }}</h2>',
    );
    await fs.writeFile(
      path.join(templateDir, "p.template.html"),
      '<p class="p">{{ p }}</p>',
    );

    await fs.writeFile(
      path.join(inputDir, "posts", "hello.md"),
      "## Hello, World!\n\nHello **bold**\n",
    );

    const res = spawnSync(
      process.execPath,
      [cli, "input", "-o", "out", "-t", "template", "--ext", "html"],
      {
        cwd: root,
        encoding: "utf-8",
      },
    );

    expect(res.status).toBe(0);

    const outFile = path.join(outDir, "input", "posts", "hello.html");
    expect(existsSync(outFile)).toBe(true);

    const html = await fs.readFile(outFile, "utf-8");
    expect(html).toContain('<h2 id="hello-world">Hello, World!</h2>');
    expect(html).toContain('<p class="p">Hello <strong>bold</strong></p>');
  });

  it("escapes raw HTML by default, and allows it with --allow-html", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-allow-html-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outSafe = path.join(root, "out-safe");
    const outAllow = path.join(root, "out-allow");
    const templateDir = path.join(root, "template");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    await fs.writeFile(
      path.join(templateDir, "p.template.html"),
      "<p>{{ p }}</p>",
    );
    await fs.writeFile(path.join(inputDir, "a.md"), "Hello <b>raw</b>\n");

    const safeRes = spawnSync(
      process.execPath,
      [cli, "input", "-o", "out-safe", "-t", "template"],
      { cwd: root, encoding: "utf-8" },
    );
    expect(safeRes.status).toBe(0);

    const safeOutFile = path.join(outSafe, "input", "a.html");
    expect(existsSync(safeOutFile)).toBe(true);

    const safeHtml = await fs.readFile(safeOutFile, "utf-8");
    expect(safeHtml).toContain("Hello &lt;b&gt;raw&lt;/b&gt;");
    expect(safeHtml).not.toContain("<b>raw</b>");

    const allowRes = spawnSync(
      process.execPath,
      [cli, "input", "-o", "out-allow", "-t", "template", "--allow-html"],
      { cwd: root, encoding: "utf-8" },
    );
    expect(allowRes.status).toBe(0);

    const allowOutFile = path.join(outAllow, "input", "a.html");
    expect(existsSync(allowOutFile)).toBe(true);

    const allowHtml = await fs.readFile(allowOutFile, "utf-8");
    expect(allowHtml).toContain("Hello <b>raw</b>");
  });

  it("fails without --out-dir", () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const res = spawnSync(process.execPath, [cli, "input"], {
      encoding: "utf-8",
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("--out-dir");
  });

  it("does not write files in --dry-run", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-dry-");
    created.push(root);

    await fs.mkdir(path.join(root, "input"), { recursive: true });
    await fs.mkdir(path.join(root, "template"), { recursive: true });

    await fs.writeFile(
      path.join(root, "template", "h2.template.html"),
      '<h2 id="{{ id }}">{{ h2 }}</h2>',
    );
    await fs.writeFile(path.join(root, "input", "a.md"), "## Dry Run\n");

    const res = spawnSync(
      process.execPath,
      [cli, "input", "-o", "out", "-t", "template", "--dry-run"],
      { cwd: root, encoding: "utf-8" },
    );

    expect(res.status).toBe(0);
    expect(existsSync(path.join(root, "out"))).toBe(false);
  });

  it("cleans output directory with --clean", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-clean-");
    created.push(root);

    await fs.mkdir(path.join(root, "input"), { recursive: true });
    await fs.mkdir(path.join(root, "template"), { recursive: true });
    await fs.mkdir(path.join(root, "out"), { recursive: true });

    await fs.writeFile(path.join(root, "out", "old.txt"), "old\n");

    await fs.writeFile(
      path.join(root, "template", "h2.template.html"),
      '<h2 id="{{ id }}">{{ h2 }}</h2>',
    );
    await fs.writeFile(path.join(root, "input", "a.md"), "## New\n");

    const res = spawnSync(
      process.execPath,
      [cli, "input", "-o", "out", "-t", "template", "--clean"],
      { cwd: root, encoding: "utf-8" },
    );

    expect(res.status).toBe(0);
    expect(existsSync(path.join(root, "out", "old.txt"))).toBe(false);
    expect(existsSync(path.join(root, "out", "input", "a.html"))).toBe(true);
  });

  it("applies codeblock template with custom wrapper", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-codeblock-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");
    const templateDir = path.join(root, "template");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    // Create codeblock template with custom wrapper
    await fs.writeFile(
      path.join(templateDir, "codeblock.template.html"),
      '<div class="code-wrapper" data-lang="{{ lang }}">\n' +
        '  <div class="code-header">Language: {{ lang }}</div>\n' +
        '  <pre><code class="hljs">{{{ code }}}</code></pre>\n' +
        "</div>",
    );

    // Create markdown with code blocks
    await fs.writeFile(
      path.join(inputDir, "code.md"),
      "# Code Examples\n\n" +
        "```javascript\n" +
        "const x = 1;\n" +
        "console.log(x);\n" +
        "```\n",
    );

    const res = spawnSync(
      process.execPath,
      [cli, "input", "-o", "out", "-t", "template"],
      {
        cwd: root,
        encoding: "utf-8",
      },
    );

    expect(res.status).toBe(0);

    const outFile = path.join(outDir, "input", "code.html");
    expect(existsSync(outFile)).toBe(true);

    const html = await fs.readFile(outFile, "utf-8");

    // Verify custom wrapper is applied
    expect(html).toContain('class="code-wrapper"');
    expect(html).toContain('data-lang="javascript"');
    expect(html).toContain('class="code-header"');
    expect(html).toContain("Language: javascript");

    // Verify syntax highlighting is preserved
    expect(html).toContain("<span");
    expect(html).toContain("class=");
    expect(html).not.toContain("&lt;span"); // HTML should not be escaped
  });

  it("uses default wrapper when codeblock template is missing", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-codeblock-default-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");
    const templateDir = path.join(root, "template");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    // Create h2 template but NO codeblock template
    await fs.writeFile(
      path.join(templateDir, "h2.template.html"),
      '<h2 id="{{ id }}">{{ h2 }}</h2>',
    );

    // Create markdown with code blocks
    await fs.writeFile(
      path.join(inputDir, "code.md"),
      "## Code\n\n" + "```typescript\n" + "const x: number = 1;\n" + "```\n",
    );

    const res = spawnSync(
      process.execPath,
      [cli, "input", "-o", "out", "-t", "template"],
      {
        cwd: root,
        encoding: "utf-8",
      },
    );

    expect(res.status).toBe(0);

    const outFile = path.join(outDir, "input", "code.html");
    expect(existsSync(outFile)).toBe(true);

    const html = await fs.readFile(outFile, "utf-8");

    // Verify default wrapper is used
    expect(html).toContain("<pre><code");
    expect(html).toContain('class="hljs language-typescript"');
    expect(html).toContain("</code></pre>");

    // Verify syntax highlighting still works
    expect(html).toContain("<span");
  });

  it("exposes lang and raw variables in codeblock template", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-codeblock-vars-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");
    const templateDir = path.join(root, "template");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    // Create codeblock template using all variables
    await fs.writeFile(
      path.join(templateDir, "codeblock.template.html"),
      '<div class="code-block">\n' +
        '  <span class="lang-badge">{{ lang }}</span>\n' +
        '  <pre class="highlighted">{{{ code }}}</pre>\n' +
        '  <pre class="raw" hidden>{{ raw }}</pre>\n' +
        "</div>",
    );

    // Create markdown with code that has HTML
    await fs.writeFile(
      path.join(inputDir, "code.md"),
      "```python\n" + "def greet():\n" + '    print("<hello>")\n' + "```\n",
    );

    const res = spawnSync(
      process.execPath,
      [cli, "input", "-o", "out", "-t", "template"],
      {
        cwd: root,
        encoding: "utf-8",
      },
    );

    expect(res.status).toBe(0);

    const outFile = path.join(outDir, "input", "code.html");
    const html = await fs.readFile(outFile, "utf-8");

    // Verify lang variable
    expect(html).toContain('<span class="lang-badge">python</span>');

    // Verify code variable has highlighted HTML (not escaped)
    expect(html).toContain('<pre class="highlighted">');
    expect(html).toContain("<span"); // highlight.js spans

    // Verify raw variable has escaped HTML
    expect(html).toContain('<pre class="raw" hidden>');
    expect(html).toContain("&lt;hello&gt;"); // HTML entities escaped
    expect(html).not.toContain('<pre class="raw" hidden><hello>');
  });

  it("handles code blocks without language specification", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-codeblock-nolang-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");
    const templateDir = path.join(root, "template");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    await fs.writeFile(
      path.join(templateDir, "codeblock.template.html"),
      '<div data-lang="{{ lang }}">{{{ code }}}</div>',
    );

    // Create markdown with code block without language
    await fs.writeFile(
      path.join(inputDir, "code.md"),
      "```\n" + "plain text\n" + "```\n",
    );

    const res = spawnSync(
      process.execPath,
      [cli, "input", "-o", "out", "-t", "template"],
      {
        cwd: root,
        encoding: "utf-8",
      },
    );

    expect(res.status).toBe(0);

    const outFile = path.join(outDir, "input", "code.html");
    const html = await fs.readFile(outFile, "utf-8");

    // Verify lang defaults to "text"
    expect(html).toContain('data-lang="text"');
    expect(html).toContain("plain text");
  });

  it("init command creates scaffold with example preset", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-init-wp-");
    created.push(root);

    const res = spawnSync(process.execPath, [cli, "init"], {
      cwd: root,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("✓ Initialization complete!");
    expect(res.stdout).toContain("example");

    // Verify files were created
    expect(
      existsSync(path.join(root, ".md-xformer/templates/h2.template.html")),
    ).toBe(true);
    expect(
      existsSync(path.join(root, ".md-xformer/templates/h3.template.html")),
    ).toBe(true);
    expect(
      existsSync(path.join(root, ".md-xformer/templates/p.template.html")),
    ).toBe(true);
    expect(existsSync(path.join(root, "articles/sample.md"))).toBe(true);

    // Verify content
    const h2Template = await fs.readFile(
      path.join(root, ".md-xformer/templates/h2.template.html"),
      "utf-8",
    );
    expect(h2Template).toContain("{{ h2 }}");
  });

  it("init command creates scaffold with generic preset", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-init-gen-");
    created.push(root);

    const res = spawnSync(
      process.execPath,
      [cli, "init", "--preset", "generic"],
      {
        cwd: root,
        encoding: "utf-8",
      },
    );

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("✓ Initialization complete!");
    expect(res.stdout).toContain("generic");

    // Verify files were created
    expect(
      existsSync(path.join(root, ".md-xformer/templates/h2.template.html")),
    ).toBe(true);
    expect(existsSync(path.join(root, "articles/sample.md"))).toBe(true);

    // Generic should not have h3 or p templates
    expect(
      existsSync(path.join(root, ".md-xformer/templates/h3.template.html")),
    ).toBe(false);
    expect(
      existsSync(path.join(root, ".md-xformer/templates/p.template.html")),
    ).toBe(false);
  });

  it("init command refuses to overwrite without --force", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-init-noforce-");
    created.push(root);

    // First init
    const res1 = spawnSync(process.execPath, [cli, "init"], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(res1.status).toBe(0);

    // Second init without force
    const res2 = spawnSync(process.execPath, [cli, "init"], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(res2.status).toBe(3);
    expect(res2.stdout).toContain("already exist");
    expect(res2.stdout).toContain("--force");
  });

  it("init command overwrites with --force", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-init-force-");
    created.push(root);

    // First init
    const res1 = spawnSync(process.execPath, [cli, "init"], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(res1.status).toBe(0);

    // Modify a file
    const h2Path = path.join(root, ".md-xformer/templates/h2.template.html");
    await fs.writeFile(h2Path, "<h2>MODIFIED</h2>", "utf-8");

    // Second init with force
    const res2 = spawnSync(process.execPath, [cli, "init", "--force"], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(res2.status).toBe(0);
    expect(res2.stdout).toContain("Overwritten");

    // File should be restored
    const restored = await fs.readFile(h2Path, "utf-8");
    expect(restored).toContain("{{ h2 }}");
    expect(restored).not.toBe("<h2>MODIFIED</h2>");
  });

  it("init command does not write files in --dry-run", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-init-dry-");
    created.push(root);

    const res = spawnSync(process.execPath, [cli, "init", "--dry-run"], {
      cwd: root,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("[DRY RUN]");
    expect(res.stdout).toContain("No files were written");

    // No files should be created
    expect(existsSync(path.join(root, ".md-xformer"))).toBe(false);
    expect(existsSync(path.join(root, "articles"))).toBe(false);
  });

  it("init command returns exit code 2 for unknown preset", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-init-bad-");
    created.push(root);

    const res = spawnSync(
      process.execPath,
      [cli, "init", "--preset", "invalid"],
      {
        cwd: root,
        encoding: "utf-8",
      },
    );

    expect(res.status).toBe(2);
    expect(res.stderr).toContain("Unknown preset");
  });

  it("init and then transform workflow works", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-init-workflow-");
    created.push(root);

    // Init
    const initRes = spawnSync(process.execPath, [cli, "init"], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(initRes.status).toBe(0);

    // Transform the sample
    const transformRes = spawnSync(
      process.execPath,
      [cli, "articles", "-t", ".md-xformer/templates", "-o", "dist"],
      {
        cwd: root,
        encoding: "utf-8",
      },
    );
    expect(transformRes.status).toBe(0);

    // Verify output
    const outFile = path.join(root, "dist", "articles", "sample.html");
    expect(existsSync(outFile)).toBe(true);

    const html = await fs.readFile(outFile, "utf-8");
    expect(html).toContain("Sample Article");
    expect(html).toContain('id="introduction"');
  });

  it("watch --once builds files and exits", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-watch-once-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");
    const templateDir = path.join(root, "template");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    await fs.writeFile(
      path.join(templateDir, "h2.template.html"),
      '<h2 id="{{ id }}">{{ h2 }}</h2>',
    );
    await fs.writeFile(
      path.join(templateDir, "p.template.html"),
      '<p class="content">{{ p }}</p>',
    );

    await fs.writeFile(
      path.join(inputDir, "test.md"),
      "## Watch Test\n\nThis is a test.\n",
    );

    const res = spawnSync(
      process.execPath,
      [cli, "watch", "input", "-o", "out", "-t", "template", "--once"],
      {
        cwd: root,
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    expect(res.status).toBe(0);

    const outFile = path.join(outDir, "input", "test.html");
    expect(existsSync(outFile)).toBe(true);

    const html = await fs.readFile(outFile, "utf-8");
    expect(html).toContain('<h2 id="watch-test">Watch Test</h2>');
    expect(html).toContain('<p class="content">This is a test.</p>');
  });

  it("watch --once with --verbose shows watch logs", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-e2e-watch-verbose-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");
    const templateDir = path.join(root, "template");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    await fs.writeFile(
      path.join(templateDir, "p.template.html"),
      "<p>{{ p }}</p>",
    );
    await fs.writeFile(path.join(inputDir, "a.md"), "Hello\n");

    const res = spawnSync(
      process.execPath,
      [
        cli,
        "watch",
        "input",
        "-o",
        "out",
        "-t",
        "template",
        "--once",
        "--verbose",
      ],
      {
        cwd: root,
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("[watch]");

    const outFile = path.join(outDir, "input", "a.html");
    expect(existsSync(outFile)).toBe(true);
  });

  it("help includes watch command", () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const res = spawnSync(process.execPath, [cli, "--help"], {
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("watch");
    expect(res.stdout).toContain("--debounce-ms");
    expect(res.stdout).toContain("--once");
  });
});
