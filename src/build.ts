import fs from "node:fs/promises";
import path from "node:path";
import { collectMarkdownFiles, ensureDir, toOutPath } from "./io.js";
import type { Templates } from "./templates.js";
import { transformMarkdownToHtml } from "./transform.js";

export type BuildOptions = {
  verbose?: boolean;
  allowHtml?: boolean;
};

export type BuildResult = {
  ok: number;
  ng: number;
  files: string[];
};

/**
 * Build a single markdown file to HTML
 */
export async function buildSingleFile(
  mdFileAbs: string,
  cwd: string,
  outDirAbs: string,
  ext: string,
  templates: Templates,
  opts: BuildOptions,
): Promise<void> {
  const md = await fs.readFile(mdFileAbs, "utf-8");
  const html = transformMarkdownToHtml(md, templates, {
    verbose: opts.verbose,
    allowHtml: opts.allowHtml,
  });

  const outFileAbs = toOutPath(mdFileAbs, cwd, outDirAbs, ext);

  if (opts.verbose) {
    console.log(
      `[emit] ${path.relative(cwd, mdFileAbs)} -> ${path.relative(
        cwd,
        outFileAbs,
      )}`,
    );
  }

  await ensureDir(path.dirname(outFileAbs));
  await fs.writeFile(outFileAbs, html, "utf-8");
}

/**
 * Build all markdown files in the input path
 */
export async function buildMarkdownFiles(
  inputAbs: string,
  cwd: string,
  outDirAbs: string,
  ext: string,
  templates: Templates,
  opts: BuildOptions,
): Promise<BuildResult> {
  const mdFiles = await collectMarkdownFiles(inputAbs);

  let ok = 0;
  let ng = 0;

  for (const mdFileAbs of mdFiles) {
    try {
      await buildSingleFile(mdFileAbs, cwd, outDirAbs, ext, templates, opts);
      ok++;
    } catch (e) {
      ng++;
      console.error(`[error] ${mdFileAbs}`);
      console.error(e);
    }
  }

  return { ok, ng, files: mdFiles };
}
