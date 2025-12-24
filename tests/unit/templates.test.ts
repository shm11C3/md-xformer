import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadTemplates } from "../../src/templates.js";

async function makeTempDir(prefix: string) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeTempDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

describe("loadTemplates", () => {
  const created: string[] = [];

  afterEach(async () => {
    for (const dir of created) await removeTempDir(dir);
    created.length = 0;
  });

  it("loads *.template.html files and lowercases keys", async () => {
    const dir = await makeTempDir("md-xformer-templates-");
    created.push(dir);

    await fs.mkdir(path.join(dir, "subdir"), { recursive: true });
    await fs.writeFile(path.join(dir, "H1.template.html"), "<h1>{{ h1 }}</h1>");
    await fs.writeFile(path.join(dir, "p.template.html"), "<p>{{ p }}</p>");
    await fs.writeFile(path.join(dir, "readme.txt"), "ignore");

    const t = await loadTemplates(dir);

    expect(t.get("h1")).toBe("<h1>{{ h1 }}</h1>");
    expect(t.get("p")).toBe("<p>{{ p }}</p>");
    expect(t.has("readme")).toBe(false);
  });
});
