import fs from "node:fs/promises";
import path from "node:path";

export type Templates = Map<string, string>;

function keyFromTemplateFilename(file: string): string | null {
  // e.g. h1.template.html -> "h1"
  const m = file.match(/^([a-z0-9]+)\.template\.html$/i);
  if (!m) return null;
  return m[1].toLowerCase();
}

export async function loadTemplates(
  templateDirAbs: string,
): Promise<Templates> {
  const entries = await fs.readdir(templateDirAbs, { withFileTypes: true });

  const map: Templates = new Map();

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const key = keyFromTemplateFilename(ent.name);
    if (!key) continue;

    const full = path.join(templateDirAbs, ent.name);
    const content = await fs.readFile(full, "utf-8");
    map.set(key, content);
  }

  return map;
}
