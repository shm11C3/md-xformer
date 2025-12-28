import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listPresets, runInit } from "../../src/init.js";

async function makeTempDir(prefix: string) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeTempDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

describe("init", () => {
  const created: string[] = [];

  afterEach(async () => {
    for (const dir of created) await removeTempDir(dir);
    created.length = 0;
  });

  it("listPresets() returns available presets", () => {
    const presets = listPresets();
    expect(presets).toContain("example");
    expect(presets).toContain("generic");
    expect(presets.length).toBeGreaterThanOrEqual(2);
  });

  it("runInit() creates expected files for example preset", async () => {
    const root = await makeTempDir("md-xformer-init-wp-");
    created.push(root);

    const exitCode = await runInit({
      preset: "example",
      dir: root,
      force: false,
      dryRun: false,
    });

    expect(exitCode).toBe(0);

    // Check that files were created
    expect(
      existsSync(path.join(root, ".md-xformer/templates/h2.template.html")),
    ).toBe(true);
    expect(
      existsSync(path.join(root, ".md-xformer/templates/h3.template.html")),
    ).toBe(true);
    expect(
      existsSync(path.join(root, ".md-xformer/templates/p.template.html")),
    ).toBe(true);
    expect(
      existsSync(
        path.join(root, ".md-xformer/templates/codeblock.template.html"),
      ),
    ).toBe(true);
    expect(existsSync(path.join(root, "articles/sample.md"))).toBe(true);

    // Verify content
    const h2Template = await fs.readFile(
      path.join(root, ".md-xformer/templates/h2.template.html"),
      "utf-8",
    );
    expect(h2Template).toContain("{{ h2 }}");
    expect(h2Template).toContain("{{ id }}");

    const sample = await fs.readFile(
      path.join(root, "articles/sample.md"),
      "utf-8",
    );
    expect(sample).toContain("# Sample Article");
  });

  it("runInit() creates expected files for generic preset", async () => {
    const root = await makeTempDir("md-xformer-init-gen-");
    created.push(root);

    const exitCode = await runInit({
      preset: "generic",
      dir: root,
      force: false,
      dryRun: false,
    });

    expect(exitCode).toBe(0);

    // Check that files were created (fewer than example)
    expect(
      existsSync(path.join(root, ".md-xformer/templates/h2.template.html")),
    ).toBe(true);
    expect(
      existsSync(
        path.join(root, ".md-xformer/templates/codeblock.template.html"),
      ),
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

  it("runInit() refuses to overwrite without --force and exits with code 3", async () => {
    const root = await makeTempDir("md-xformer-init-noforce-");
    created.push(root);

    // First init
    await runInit({
      preset: "example",
      dir: root,
      force: false,
      dryRun: false,
    });

    // Second init without force
    const exitCode = await runInit({
      preset: "example",
      dir: root,
      force: false,
      dryRun: false,
    });

    expect(exitCode).toBe(3);

    // Files should still exist
    expect(
      existsSync(path.join(root, ".md-xformer/templates/h2.template.html")),
    ).toBe(true);
  });

  it("runInit() overwrites files with --force", async () => {
    const root = await makeTempDir("md-xformer-init-force-");
    created.push(root);

    // First init
    await runInit({
      preset: "example",
      dir: root,
      force: false,
      dryRun: false,
    });

    // Modify a file
    const h2Path = path.join(root, ".md-xformer/templates/h2.template.html");
    await fs.writeFile(h2Path, "<h2>MODIFIED</h2>", "utf-8");

    const modified = await fs.readFile(h2Path, "utf-8");
    expect(modified).toBe("<h2>MODIFIED</h2>");

    // Second init with force
    const exitCode = await runInit({
      preset: "example",
      dir: root,
      force: true,
      dryRun: false,
    });

    expect(exitCode).toBe(0);

    // File should be restored
    const restored = await fs.readFile(h2Path, "utf-8");
    expect(restored).toContain("{{ h2 }}");
    expect(restored).not.toBe("<h2>MODIFIED</h2>");
  });

  it("runInit() does not write files in --dry-run mode", async () => {
    const root = await makeTempDir("md-xformer-init-dry-");
    created.push(root);

    const exitCode = await runInit({
      preset: "example",
      dir: root,
      force: false,
      dryRun: true,
    });

    expect(exitCode).toBe(0);

    // No files should be created
    expect(existsSync(path.join(root, ".md-xformer"))).toBe(false);
    expect(existsSync(path.join(root, "articles"))).toBe(false);
  });

  it("runInit() returns exit code 2 for unknown preset", async () => {
    const root = await makeTempDir("md-xformer-init-bad-");
    created.push(root);

    const exitCode = await runInit({
      preset: "invalid-preset-name",
      dir: root,
      force: false,
      dryRun: false,
    });

    expect(exitCode).toBe(2);

    // No files should be created
    expect(existsSync(path.join(root, ".md-xformer"))).toBe(false);
  });

  it("runInit() creates missing files but skips existing ones", async () => {
    const root = await makeTempDir("md-xformer-init-partial-");
    created.push(root);

    // Create only some files manually
    await fs.mkdir(path.join(root, ".md-xformer/templates"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(root, ".md-xformer/templates/h2.template.html"),
      "<h2>EXISTING</h2>",
      "utf-8",
    );

    const exitCode = await runInit({
      preset: "example",
      dir: root,
      force: false,
      dryRun: false,
    });

    // Should exit with code 3 because some files already exist
    expect(exitCode).toBe(3);

    // Existing file should not be modified
    const h2Content = await fs.readFile(
      path.join(root, ".md-xformer/templates/h2.template.html"),
      "utf-8",
    );
    expect(h2Content).toBe("<h2>EXISTING</h2>");

    // But other files should be created
    expect(
      existsSync(path.join(root, ".md-xformer/templates/h3.template.html")),
    ).toBe(true);
    expect(
      existsSync(
        path.join(root, ".md-xformer/templates/codeblock.template.html"),
      ),
    ).toBe(true);
  });
});
