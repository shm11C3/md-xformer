import { existsSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { listPresets, runInit } from "./init.js";
import { collectMarkdownFiles, ensureDir, removeDir, toOutPath } from "./io.js";
import { loadTemplates } from "./templates.js";
import { transformMarkdownToHtml } from "./transform.js";
import { startWatch } from "./watch.js";

type CliOptions = {
  templateDir: string;
  outDir: string;
  ext: string;
  clean: boolean;
  dryRun: boolean;
  verbose: boolean;
  allowHtml: boolean;
};

type WatchCliOptions = CliOptions & {
  debounceMs: number;
  once: boolean;
};

function printHelp(): void {
  console.log(
    `
Usage:
  md-xformer <input> -o <outDir> [-t <templateDir>] [--ext html] [--clean] [--dry-run] [--verbose] [--allow-html]
  md-xformer watch <input> -o <outDir> [-t <templateDir>] [--ext html] [--verbose] [--allow-html] [--debounce-ms 100] [--once]
  md-xformer init [--preset <name>] [--dir <path>] [--force] [--dry-run]

Commands:
  (default)            Convert Markdown to HTML
  watch                Watch for changes and rebuild automatically
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

Watch options:
  --debounce-ms        Debounce delay in ms before rebuild (default: 100)
  --once               Build once and exit (useful for testing)

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

type BuildOnceParams = {
  inputAbs: string;
  templateAbs: string;
  outAbs: string;
  ext: string;
  verbose: boolean;
  allowHtml: boolean;
  dryRun: boolean;
};

async function buildOnce(
  params: BuildOnceParams,
): Promise<{ ok: number; ng: number }> {
  const { inputAbs, templateAbs, outAbs, ext, verbose, allowHtml, dryRun } =
    params;
  const cwd = process.cwd();

  const templates = await loadTemplates(templateAbs);
  const mdFiles = await collectMarkdownFiles(inputAbs);

  if (mdFiles.length === 0) {
    throw new CliError(`ERROR: no markdown files found under: ${inputAbs}`);
  }

  if (verbose) {
    console.log(`[input] ${inputAbs}`);
    console.log(`[templates] ${templateAbs}`);
    console.log(`[out] ${outAbs}`);
    console.log(`[files] ${mdFiles.length}`);
  }

  let ok = 0;
  let ng = 0;

  for (const mdFileAbs of mdFiles) {
    try {
      const md = await fs.readFile(mdFileAbs, "utf-8");
      const html = transformMarkdownToHtml(md, templates, {
        verbose,
        allowHtml,
      });

      const outFileAbs = toOutPath(mdFileAbs, cwd, outAbs, ext);

      if (verbose) {
        console.log(
          `[emit] ${path.relative(cwd, mdFileAbs)} -> ${path.relative(cwd, outFileAbs)}`,
        );
      }

      if (!dryRun) {
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

  if (verbose) {
    console.log(`[done] ok=${ok} ng=${ng}`);
  }

  return { ok, ng };
}

async function handleWatchCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      "template-dir": { type: "string", short: "t" },
      "out-dir": { type: "string", short: "o" },
      ext: { type: "string" },
      verbose: { type: "boolean" },
      "allow-html": { type: "boolean" },
      "debounce-ms": { type: "string" },
      once: { type: "boolean" },
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

  const opts: WatchCliOptions = {
    templateDir: values["template-dir"] ?? "template",
    outDir: values["out-dir"] ?? "",
    ext: values.ext ?? "html",
    clean: false, // watch does not support --clean
    dryRun: false, // watch does not support --dry-run
    verbose: Boolean(values.verbose),
    allowHtml: Boolean(values["allow-html"]),
    debounceMs: Number.parseInt(values["debounce-ms"] ?? "100", 10),
    once: Boolean(values.once),
  };

  if (!opts.outDir) die("ERROR: --out-dir (-o) is required.");
  if (Number.isNaN(opts.debounceMs) || opts.debounceMs < 0) {
    die("ERROR: --debounce-ms must be a non-negative integer.");
  }

  const inputAbs = path.resolve(process.cwd(), input);
  const outAbs = path.resolve(process.cwd(), opts.outDir);
  const templateAbs = path.resolve(process.cwd(), opts.templateDir);

  if (!existsSync(templateAbs)) {
    die(`ERROR: template directory not found: ${templateAbs}`);
  }

  if (!existsSync(inputAbs)) {
    die(`ERROR: input path not found: ${inputAbs}`);
  }

  // Ensure output directory exists
  await ensureDir(outAbs);

  if (opts.verbose) {
    console.log(`[watch] input: ${inputAbs}`);
    console.log(`[watch] templates: ${templateAbs}`);
    console.log(`[watch] output: ${outAbs}`);
    console.log(`[watch] debounce: ${opts.debounceMs}ms`);
  }

  const buildParams: BuildOnceParams = {
    inputAbs,
    templateAbs,
    outAbs,
    ext: opts.ext,
    verbose: opts.verbose,
    allowHtml: opts.allowHtml,
    dryRun: false,
  };

  // `--once` is intentionally implemented without starting a watcher.
  // This keeps tests stable and ensures we return a correct exit code.
  if (opts.once) {
    const result = await buildOnce(buildParams);
    return result.ng > 0 ? 1 : 0;
  }

  // Initial build on start (watch continues even if build has errors).
  const initial = await buildOnce(buildParams);
  if (initial.ng > 0) {
    process.exitCode = 1;
  }

  return new Promise((resolve) => {
    const watcher = startWatch({
      inputAbs,
      templateAbs,
      outAbs,
      debounceMs: opts.debounceMs,
      verbose: opts.verbose,
      once: false,
      onBuild: async () => {
        const result = await buildOnce(buildParams);
        if (result.ng > 0) process.exitCode = 1;
      },
    });

    watcher.on("close", () => {
      resolve(0);
    });

    process.on("SIGINT", () => {
      if (opts.verbose) {
        console.log("\n[watch] shutting down...");
      }
      watcher.close();
    });
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

  // Check if first positional is "watch" command
  if (argv[0] === "watch") {
    return await handleWatchCommand(argv.slice(1));
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

  if (!existsSync(inputAbs)) {
    die(`ERROR: input path not found: ${inputAbs}`);
  }

  if (opts.clean && existsSync(outAbs)) {
    if (opts.verbose) console.log(`[clean] ${outAbs}`);
    if (!opts.dryRun) await removeDir(outAbs);
  }

  if (!opts.dryRun) await ensureDir(outAbs);

  const result = await buildOnce({
    inputAbs,
    templateAbs,
    outAbs,
    ext: opts.ext,
    verbose: opts.verbose,
    allowHtml: opts.allowHtml,
    dryRun: opts.dryRun,
  });

  if (result.ng > 0) {
    process.exitCode = 1;
  }

  return result.ng > 0 ? 1 : 0;
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
