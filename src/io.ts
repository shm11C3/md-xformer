import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirAbs: string): Promise<void> {
  await fs.mkdir(dirAbs, { recursive: true });
}

export async function removeDir(dirAbs: string): Promise<void> {
  // Node 20+ supports fs.rm recursive
  await fs.rm(dirAbs, { recursive: true, force: true });
}

async function walkDir(dirAbs: string, acc: string[]): Promise<void> {
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dirAbs, ent.name);
    if (ent.isDirectory()) {
      // skip common junk
      // TODO ignoreファイルで設定できるようにする
      if (
        ent.name === "node_modules" ||
        ent.name === ".git" ||
        ent.name === "dist"
      )
        continue;
      await walkDir(p, acc);
    } else if (ent.isFile()) {
      if (p.toLowerCase().endsWith(".md")) acc.push(p);
    }
  }
}

export async function collectMarkdownFiles(
  inputAbs: string,
): Promise<string[]> {
  if (!existsSync(inputAbs)) return [];

  const st = await fs.stat(inputAbs);
  if (st.isFile()) {
    if (!inputAbs.toLowerCase().endsWith(".md")) return [];
    return [inputAbs];
  }

  if (st.isDirectory()) {
    const acc: string[] = [];
    await walkDir(inputAbs, acc);
    acc.sort();
    return acc;
  }

  return [];
}

/**
 * Mirrors from cwd:
 *   <cwd>/articles/foo/main.md -> <outDir>/articles/foo/main.html
 */
export function toOutPath(
  mdFileAbs: string,
  cwd: string,
  outDirAbs: string,
  ext: string,
): string {
  const rel = path.relative(cwd, mdFileAbs);
  const relNoExt = rel.replace(/\.md$/i, "");
  return path.join(outDirAbs, `${relNoExt}.${ext}`);
}
