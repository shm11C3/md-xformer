import { existsSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { listPresets, runInit } from "./init.js";
import { collectMarkdownFiles, ensureDir, removeDir, toOutPath } from "./io.js";
import { loadTemplates } from "./templates.js";
import { transformMarkdownToHtml } from "./transform.js";

type CliOptions = {
  templateDir: string;
  outDir: string;
  ext: string;
  clean: boolean;
  dryRun: boolean;
  verbose: boolean;
  allowHtml: boolean;
};

function printHelp(): void {
  console.log(
    `
Usage:
  md-xformer <input> -o <outDir> [-t <templateDir>] [--ext html] [--clean] [--dry-run] [--verbose] [--allow-html]
  md-xformer init [--preset <name>] [--dir <path>] [--force] [--dry-run]

Commands:
  (default)            Convert Markdown to HTML
  init                 Scaffold a new project with templates and sample content

Transform options:
  <input>              File path (.md) OR directory path (recursively finds **/*.md)
  -t, --template-dir   Template directory (default: ./template)
  -o, --out-dir        Output directory (required)
  --ext                Output extension (default: html)
  --clean              Remove output directory before build
  --dry-run            Print what would be generated without writing
  --verbose            Verbose logs
  --allow-html         Allow raw HTML in Markdown input (unsafe for untrusted input)

Init options:
  --preset <name>      Scaffold preset (default: example)
                       Available: ${listPresets().join(", ")}
  --dir <path>         Target directory (default: .)
  --force              Overwrite existing files
  --dry-run            Show what would be created without writing

Global options:
  -h, --help           Show help
`.trim(),
  );
}

class CliError extends Error {
  exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function die(msg: string, exitCode = 1): never {
  throw new CliError(msg, exitCode);
}

async function handleInitCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      preset: { type: "string" },
      dir: { type: "string" },
      force: { type: "boolean" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  return await runInit({
    preset: values.preset ?? "example",
    dir: values.dir ?? ".",
    force: Boolean(values.force),
    dryRun: Boolean(values["dry-run"]),
  });
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    return await mainWithArgs(argv);
  } catch (e) {
    if (e instanceof CliError) {
      console.error(e.message);
      return e.exitCode;
    }

    console.error(e);
    return 1;
  }
}

async function mainWithArgs(argv: string[]): Promise<number> {
  // Check if first positional is "init" command
  if (argv[0] === "init") {
    return await handleInitCommand(argv.slice(1));
  }

  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      "template-dir": { type: "string", short: "t" },
      "out-dir": { type: "string", short: "o" },
      ext: { type: "string" },
      clean: { type: "boolean" },
      "dry-run": { type: "boolean" },
      verbose: { type: "boolean" },
      "allow-html": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  const input = positionals[0];
  if (!input) die("ERROR: <input> is required. Use --help.");

  const opts: CliOptions = {
    templateDir: values["template-dir"] ?? "template",
    outDir: values["out-dir"] ?? "",
    ext: values.ext ?? "html",
    clean: Boolean(values.clean),
    dryRun: Boolean(values["dry-run"]),
    verbose: Boolean(values.verbose),
    allowHtml: Boolean(values["allow-html"]),
  };

  if (!opts.outDir) die("ERROR: --out-dir (-o) is required.");

  const inputAbs = path.resolve(process.cwd(), input);
  const outAbs = path.resolve(process.cwd(), opts.outDir);
  const templateAbs = path.resolve(process.cwd(), opts.templateDir);

  if (!existsSync(templateAbs)) {
    die(`ERROR: template directory not found: ${templateAbs}`);
  }

  if (opts.clean && existsSync(outAbs)) {
    if (opts.verbose) console.log(`[clean] ${outAbs}`);
    if (!opts.dryRun) await removeDir(outAbs);
  }

  if (!opts.dryRun) await ensureDir(outAbs);

  const templates = await loadTemplates(templateAbs);

  // Collect inputs
  const mdFiles = await collectMarkdownFiles(inputAbs);
  if (mdFiles.length === 0) {
    die(`ERROR: no markdown files found under: ${inputAbs}`);
  }

  if (opts.verbose) {
    console.log(`[input] ${inputAbs}`);
    console.log(`[templates] ${templateAbs}`);
    console.log(`[out] ${outAbs}`);
    console.log(`[files] ${mdFiles.length}`);
  }

  const cwd = process.cwd();

  let ok = 0;
  let ng = 0;

  for (const mdFileAbs of mdFiles) {
    try {
      const md = await fs.readFile(mdFileAbs, "utf-8");
      const html = transformMarkdownToHtml(md, templates, {
        verbose: opts.verbose,
        allowHtml: opts.allowHtml,
      });

      const outFileAbs = toOutPath(mdFileAbs, cwd, outAbs, opts.ext);

      if (opts.verbose) {
        console.log(
          `[emit] ${path.relative(cwd, mdFileAbs)} -> ${path.relative(
            cwd,
            outFileAbs,
          )}`,
        );
      }

      if (!opts.dryRun) {
        await ensureDir(path.dirname(outFileAbs));
        await fs.writeFile(outFileAbs, html, "utf-8");
      }

      ok++;
    } catch (e) {
      ng++;
      console.error(`[error] ${mdFileAbs}`);
      console.error(e);
    }
  }

  if (ng > 0) {
    process.exitCode = 1;
  }

  if (opts.verbose) {
    console.log(`[done] ok=${ok} ng=${ng}`);
  }

  return ng > 0 ? 1 : 0;
}

const invoked = process.argv[1];
const isMain = (() => {
  if (typeof invoked !== "string") return false;
  try {
    // When installed via npm, the bin may be a symlink (node_modules/.bin).
    // Compare real paths so the CLI still runs when invoked through a symlink.
    const invokedReal = realpathSync(invoked);
    const selfReal = realpathSync(fileURLToPath(import.meta.url));
    return invokedReal === selfReal;
  } catch {
    // Fallback: best-effort path compare
    return (
      path.resolve(invoked) === path.resolve(fileURLToPath(import.meta.url))
    );
  }
})();

if (isMain) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
