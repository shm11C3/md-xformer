import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectMarkdownFiles,
  ensureDir,
  removeDir,
  toOutPath,
} from "../../src/io.js";

async function makeTempDir(prefix: string) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeTempDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

describe("io", () => {
  const created: string[] = [];

  afterEach(async () => {
    for (const dir of created) await removeTempDir(dir);
    created.length = 0;
  });

  it("collectMarkdownFiles() returns sorted markdown files and skips junk dirs", async () => {
    const root = await makeTempDir("md-xformer-io-");
    created.push(root);

    const input = path.join(root, "input");
    await fs.mkdir(path.join(input, "a"), { recursive: true });
    await fs.mkdir(path.join(input, "b"), { recursive: true });
    await fs.mkdir(path.join(input, "node_modules", "x"), { recursive: true });
    await fs.mkdir(path.join(input, ".git", "x"), { recursive: true });
    await fs.mkdir(path.join(input, "dist", "x"), { recursive: true });

    await fs.writeFile(path.join(input, "b", "2.md"), "# two\n");
    await fs.writeFile(path.join(input, "a", "1.md"), "# one\n");
    await fs.writeFile(path.join(input, "a", "note.txt"), "ignore\n");

    // symlink: Dirent.isFile() is false on many platforms
    await fs.symlink(
      path.join(input, "a", "1.md"),
      path.join(input, "link.md"),
    );

    await fs.writeFile(
      path.join(input, "node_modules", "x", "bad.md"),
      "# bad\n",
    );
    await fs.writeFile(path.join(input, ".git", "x", "bad.md"), "# bad\n");
    await fs.writeFile(path.join(input, "dist", "x", "bad.md"), "# bad\n");

    const files = await collectMarkdownFiles(input);

    expect(files.map((p) => path.relative(input, p))).toEqual([
      path.join("a", "1.md"),
      path.join("b", "2.md"),
    ]);
  });

  it("collectMarkdownFiles() returns [] for missing path", async () => {
    const root = await makeTempDir("md-xformer-missing-");
    created.push(root);

    const missing = path.join(root, "nope");
    const files = await collectMarkdownFiles(missing);
    expect(files).toEqual([]);
  });

  it("collectMarkdownFiles() returns [] for non-md file", async () => {
    const root = await makeTempDir("md-xformer-nonmd-");
    created.push(root);

    const file = path.join(root, "note.txt");
    await fs.writeFile(file, "hello\n");

    const files = await collectMarkdownFiles(file);
    expect(files).toEqual([]);
  });

  it("collectMarkdownFiles() returns [file] for a markdown file", async () => {
    const root = await makeTempDir("md-xformer-mdfile-");
    created.push(root);

    const file = path.join(root, "a.md");
    await fs.writeFile(file, "# title\n");

    const files = await collectMarkdownFiles(file);
    expect(files).toEqual([file]);
  });

  it("ensureDir() creates directories and removeDir() deletes them", async () => {
    const root = await makeTempDir("md-xformer-rm-");
    created.push(root);

    const nested = path.join(root, "a", "b", "c");
    await ensureDir(nested);
    const st = await fs.stat(nested);
    expect(st.isDirectory()).toBe(true);

    await removeDir(path.join(root, "a"));
    await expect(fs.stat(nested)).rejects.toBeTruthy();
  });

  it("toOutPath() mirrors from cwd and changes extension", async () => {
    const root = await makeTempDir("md-xformer-out-");
    created.push(root);

    const cwd = root;
    const mdAbs = path.join(root, "articles", "foo", "main.md");
    const outDir = path.join(root, "out");

    const outAbs = toOutPath(mdAbs, cwd, outDir, "html");
    expect(outAbs).toBe(path.join(outDir, "articles", "foo", "main.html"));
  });
});
