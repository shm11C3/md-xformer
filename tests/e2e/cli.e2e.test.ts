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
});
