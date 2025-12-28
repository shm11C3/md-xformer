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

describe("watch command (e2e)", () => {
  const created: string[] = [];

  afterEach(async () => {
    for (const dir of created) await removeTempDir(dir);
    created.length = 0;
  });

  it("prints help for watch command", () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const res = spawnSync(process.execPath, [cli, "watch", "--help"], {
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("watch");
    expect(res.stdout).toContain("--debounce");
    expect(res.stdout).toContain("--once");
  });

  it("watch command with --once flag runs a single build", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-watch-once-");
    created.push(root);

    const inputDir = path.join(root, "articles");
    const outDir = path.join(root, "dist");
    const templateDir = path.join(root, ".md-xformer", "templates");

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
      "## Test\n\nContent here.\n",
    );

    const res = spawnSync(
      process.execPath,
      [
        cli,
        "watch",
        "articles",
        "-t",
        ".md-xformer/templates",
        "-o",
        "dist",
        "--once",
      ],
      {
        cwd: root,
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Starting watch mode");
    expect(res.stdout).toContain("Rebuilding");
    expect(res.stdout).toContain("Build succeeded");
    expect(res.stdout).toContain("--once flag set, exiting");

    // Verify output file
    const outFile = path.join(outDir, "articles", "test.html");
    expect(existsSync(outFile)).toBe(true);

    const html = await fs.readFile(outFile, "utf-8");
    expect(html).toContain('<h2 id="test">Test</h2>');
    expect(html).toContain('<p class="content">Content here.</p>');
  });

  it("watch command with --verbose shows detailed logs", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-watch-verbose-");
    created.push(root);

    const inputDir = path.join(root, "articles");
    const templateDir = path.join(root, ".md-xformer", "templates");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    await fs.writeFile(
      path.join(templateDir, "h2.template.html"),
      '<h2 id="{{ id }}">{{ h2 }}</h2>',
    );
    await fs.writeFile(path.join(inputDir, "test.md"), "## Test\n");

    const res = spawnSync(
      process.execPath,
      [
        cli,
        "watch",
        "articles",
        "-t",
        ".md-xformer/templates",
        "-o",
        "dist",
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
    expect(res.stdout).toContain("Watch patterns:");
    expect(res.stdout).toContain("Ignore patterns:");
    expect(res.stdout).toContain("articles/**/*.md");
    expect(res.stdout).toContain("[emit]");
  });

  it("watch command fails without required --out option", () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const res = spawnSync(
      process.execPath,
      [cli, "watch", "articles", "-t", "templates"],
      {
        encoding: "utf-8",
      },
    );

    expect(res.status).toBe(2);
    expect(res.stderr).toContain("--out");
  });

  it("watch command fails without required input", () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const res = spawnSync(process.execPath, [cli, "watch", "-o", "dist"], {
      encoding: "utf-8",
    });

    expect(res.status).toBe(2);
    expect(res.stderr).toContain("<input> is required");
  });

  it("watch command fails with invalid debounce value", () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const res = spawnSync(
      process.execPath,
      [cli, "watch", "articles", "-o", "dist", "--debounce", "invalid"],
      {
        encoding: "utf-8",
      },
    );

    expect(res.status).toBe(2);
    expect(res.stderr).toContain("--debounce must be a positive number");
  });

  it("watch command fails when input path does not exist", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-watch-noexist-");
    created.push(root);

    const templateDir = path.join(root, ".md-xformer", "templates");
    await fs.mkdir(templateDir, { recursive: true });
    await fs.writeFile(
      path.join(templateDir, "h2.template.html"),
      '<h2 id="{{ id }}">{{ h2 }}</h2>',
    );

    const res = spawnSync(
      process.execPath,
      [
        cli,
        "watch",
        "nonexistent",
        "-t",
        ".md-xformer/templates",
        "-o",
        "dist",
        "--once",
      ],
      {
        cwd: root,
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("input path not found");
  });

  it("watch command fails when template directory does not exist", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-watch-notemp-");
    created.push(root);

    const inputDir = path.join(root, "articles");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "test.md"), "## Test\n");

    const res = spawnSync(
      process.execPath,
      [cli, "watch", "articles", "-t", "nonexistent", "-o", "dist", "--once"],
      {
        cwd: root,
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("template directory not found");
  });

  it("watch command rejects directory input with file-like output", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-watch-invalid-");
    created.push(root);

    const inputDir = path.join(root, "articles");
    const templateDir = path.join(root, ".md-xformer", "templates");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });
    await fs.writeFile(
      path.join(templateDir, "h2.template.html"),
      "<h2>{{ h2 }}</h2>",
    );
    await fs.writeFile(path.join(inputDir, "test.md"), "## Test\n");

    const res = spawnSync(
      process.execPath,
      [
        cli,
        "watch",
        "articles",
        "-t",
        ".md-xformer/templates",
        "-o",
        "output.html",
        "--once",
      ],
      {
        cwd: root,
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    expect(res.status).toBe(2);
    expect(res.stderr).toContain(
      "Cannot use directory input with file-like output",
    );
  });

  it("watch command builds multiple markdown files in directory mode", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-watch-multi-");
    created.push(root);

    const inputDir = path.join(root, "articles");
    const templateDir = path.join(root, ".md-xformer", "templates");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    await fs.writeFile(
      path.join(templateDir, "h2.template.html"),
      '<h2 id="{{ id }}">{{ h2 }}</h2>',
    );
    await fs.writeFile(
      path.join(templateDir, "p.template.html"),
      "<p>{{ p }}</p>",
    );

    await fs.writeFile(
      path.join(inputDir, "first.md"),
      "## First\n\nContent 1.\n",
    );
    await fs.writeFile(
      path.join(inputDir, "second.md"),
      "## Second\n\nContent 2.\n",
    );

    const res = spawnSync(
      process.execPath,
      [
        cli,
        "watch",
        "articles",
        "-t",
        ".md-xformer/templates",
        "-o",
        "dist",
        "--once",
      ],
      {
        cwd: root,
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Build succeeded: 2 files");

    // Verify both output files
    const firstOut = path.join(root, "dist", "articles", "first.html");
    const secondOut = path.join(root, "dist", "articles", "second.html");

    expect(existsSync(firstOut)).toBe(true);
    expect(existsSync(secondOut)).toBe(true);

    const firstHtml = await fs.readFile(firstOut, "utf-8");
    const secondHtml = await fs.readFile(secondOut, "utf-8");

    expect(firstHtml).toContain('<h2 id="first">First</h2>');
    expect(secondHtml).toContain('<h2 id="second">Second</h2>');
  });

  it("watch command with custom --debounce value", async () => {
    const cli = distCliPath();
    expect(existsSync(cli)).toBe(true);

    const root = await makeTempDir("md-xformer-watch-debounce-");
    created.push(root);

    const inputDir = path.join(root, "articles");
    const templateDir = path.join(root, ".md-xformer", "templates");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(templateDir, { recursive: true });

    await fs.writeFile(
      path.join(templateDir, "h2.template.html"),
      "<h2>{{ h2 }}</h2>",
    );
    await fs.writeFile(path.join(inputDir, "test.md"), "## Test\n");

    const res = spawnSync(
      process.execPath,
      [
        cli,
        "watch",
        "articles",
        "-t",
        ".md-xformer/templates",
        "-o",
        "dist",
        "--debounce",
        "500",
        "--once",
      ],
      {
        cwd: root,
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Debounce: 500ms");
  });
});
