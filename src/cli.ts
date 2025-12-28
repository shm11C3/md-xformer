import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildMarkdownFiles } from "./build.js";
import { listPresets, runInit } from "./init.js";
import { collectMarkdownFiles, ensureDir, removeDir } from "./io.js";
import { loadTemplates } from "./templates.js";
import { runWatch } from "./watch.js";

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
  md-xformer watch <input> [-t <templateDir>] [-o <outDir>] [--dir <path>] [--include <glob>] [--ignore <glob>] [--debounce <ms>] [--once] [--verbose]
  md-xformer init [--preset <name>] [--dir <path>] [--force] [--dry-run]

Commands:
  (default)            Convert Markdown to HTML
  watch                Watch files and rebuild on changes
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
  <input>              File or directory to watch
  -t, --template       Template preset or directory (default: .md-xformer/templates)
  -o, --out            Output file or directory (required)
  --dir                Working directory (default: current directory)
  --include            Additional watch glob patterns (repeatable)
  --ignore             Ignore patterns (repeatable)
  --debounce           Debounce interval in milliseconds (default: 200)
  --once               Run a single build then exit
  --verbose            More logging

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

async function handleWatchCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      template: { type: "string", short: "t" },
      out: { type: "string", short: "o" },
      dir: { type: "string" },
      include: { type: "string", multiple: true },
      ignore: { type: "string", multiple: true },
      debounce: { type: "string" },
      once: { type: "boolean" },
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
  if (!input) {
    console.error("ERROR: <input> is required for watch command. Use --help.");
    return 2;
  }

  const outDir = values.out;
  if (!outDir) {
    console.error("ERROR: --out (-o) is required for watch command.");
    return 2;
  }

  const workingDir = values.dir ?? process.cwd();
  const inputAbs = path.resolve(workingDir, input);

  // Parse debounce as number
  let debounce = 200;
  if (values.debounce) {
    const parsed = Number.parseInt(values.debounce, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      console.error("ERROR: --debounce must be a positive number");
      return 2;
    }
    debounce = parsed;
  }

  return await runWatch(inputAbs, {
    templateDir: values.template ?? ".md-xformer/templates",
    outDir,
    ext: "html",
    workingDir,
    include: values.include ?? [],
    ignore: values.ignore ?? [],
    debounce,
    once: Boolean(values.once),
    verbose: Boolean(values.verbose),
    allowHtml: Boolean(values["allow-html"]),
  });
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
  // Check if first positional is "init" or "watch" command
  if (argv[0] === "init") {
    return await handleInitCommand(argv.slice(1));
  }

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

  if (opts.dryRun) {
    // In dry-run mode, just verify files exist
    if (opts.verbose) {
      console.log(`[done] ok=${mdFiles.length} ng=0`);
    }
    return 0;
  }

  const result = await buildMarkdownFiles(
    inputAbs,
    cwd,
    outAbs,
    opts.ext,
    templates,
    {
      verbose: opts.verbose,
      allowHtml: opts.allowHtml,
    },
  );

  if (result.ng > 0) {
    process.exitCode = 1;
  }

  if (opts.verbose) {
    console.log(`[done] ok=${result.ok} ng=${result.ng}`);
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
