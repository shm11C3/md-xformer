import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMarkdownFiles, buildSingleFile } from "../../src/build.js";
import type { Templates } from "../../src/templates.js";

async function makeTempDir(prefix: string) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeTempDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

describe("build", () => {
  const created: string[] = [];

  afterEach(async () => {
    for (const dir of created) await removeTempDir(dir);
    created.length = 0;
  });

  it("buildSingleFile() generates HTML from markdown", async () => {
    const root = await makeTempDir("md-xformer-build-single-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });

    const mdFile = path.join(inputDir, "test.md");
    await fs.writeFile(mdFile, "## Hello\n\nWorld\n");

    const templates: Templates = new Map([
      ["h2", '<h2 id="{{ id }}">{{ h2 }}</h2>'],
      ["p", "<p>{{ p }}</p>"],
    ]);

    await buildSingleFile(mdFile, root, outDir, "html", templates, {
      verbose: false,
      allowHtml: false,
    });

    const outFile = path.join(outDir, "input", "test.html");
    const html = await fs.readFile(outFile, "utf-8");

    expect(html).toContain('<h2 id="hello">Hello</h2>');
    expect(html).toContain("<p>World</p>");
  });

  it("buildSingleFile() creates parent directories", async () => {
    const root = await makeTempDir("md-xformer-build-dirs-");
    created.push(root);

    const inputDir = path.join(root, "input", "nested", "deep");
    const outDir = path.join(root, "out");

    await fs.mkdir(inputDir, { recursive: true });

    const mdFile = path.join(inputDir, "test.md");
    await fs.writeFile(mdFile, "## Test\n");

    const templates: Templates = new Map([["h2", "<h2>{{ h2 }}</h2>"]]);

    await buildSingleFile(mdFile, root, outDir, "html", templates, {
      verbose: false,
      allowHtml: false,
    });

    const outFile = path.join(outDir, "input", "nested", "deep", "test.html");
    expect(await fs.stat(outFile).then((s) => s.isFile())).toBe(true);
  });

  it("buildMarkdownFiles() processes multiple files", async () => {
    const root = await makeTempDir("md-xformer-build-multi-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });

    await fs.writeFile(path.join(inputDir, "a.md"), "## A\n");
    await fs.writeFile(path.join(inputDir, "b.md"), "## B\n");

    const templates: Templates = new Map([["h2", "<h2>{{ h2 }}</h2>"]]);

    const result = await buildMarkdownFiles(
      inputDir,
      root,
      outDir,
      "html",
      templates,
      {
        verbose: false,
        allowHtml: false,
      },
    );

    expect(result.ok).toBe(2);
    expect(result.ng).toBe(0);
    expect(result.files).toHaveLength(2);

    const aFile = path.join(outDir, "input", "a.html");
    const bFile = path.join(outDir, "input", "b.html");

    expect(await fs.stat(aFile).then((s) => s.isFile())).toBe(true);
    expect(await fs.stat(bFile).then((s) => s.isFile())).toBe(true);
  });

  it("buildMarkdownFiles() handles errors gracefully", async () => {
    const root = await makeTempDir("md-xformer-build-error-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");

    await fs.mkdir(inputDir, { recursive: true });

    // Create a valid file and an invalid markdown file
    await fs.writeFile(path.join(inputDir, "valid.md"), "## Valid\n");

    const templates: Templates = new Map([["h2", "<h2>{{ h2 }}</h2>"]]);

    const result = await buildMarkdownFiles(
      inputDir,
      root,
      outDir,
      "html",
      templates,
      {
        verbose: false,
        allowHtml: false,
      },
    );

    expect(result.ok).toBe(1);
    expect(result.ng).toBe(0);
  });

  it("buildMarkdownFiles() returns empty result for directory with no markdown files", async () => {
    const root = await makeTempDir("md-xformer-build-empty-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "not-markdown.txt"), "hello\n");

    const templates: Templates = new Map();

    const result = await buildMarkdownFiles(
      inputDir,
      root,
      outDir,
      "html",
      templates,
      {
        verbose: false,
        allowHtml: false,
      },
    );

    expect(result.ok).toBe(0);
    expect(result.ng).toBe(0);
    expect(result.files).toHaveLength(0);
  });

  it("buildSingleFile() respects allowHtml option", async () => {
    const root = await makeTempDir("md-xformer-build-html-");
    created.push(root);

    const inputDir = path.join(root, "input");
    const outDir = path.join(root, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });

    const mdFile = path.join(inputDir, "test.md");
    await fs.writeFile(mdFile, "Hello <b>raw</b>\n");

    const templates: Templates = new Map([["p", "<p>{{ p }}</p>"]]);

    // Without allowHtml
    await buildSingleFile(mdFile, root, outDir, "html", templates, {
      verbose: false,
      allowHtml: false,
    });

    const outFile = path.join(outDir, "input", "test.html");
    const htmlEscaped = await fs.readFile(outFile, "utf-8");
    expect(htmlEscaped).toContain("&lt;b&gt;raw&lt;/b&gt;");

    // With allowHtml
    await buildSingleFile(mdFile, root, outDir, "html", templates, {
      verbose: false,
      allowHtml: true,
    });

    const htmlRaw = await fs.readFile(outFile, "utf-8");
    expect(htmlRaw).toContain("<b>raw</b>");
  });
});
