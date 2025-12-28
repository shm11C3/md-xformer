import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import chokidar from "chokidar";
import { buildMarkdownFiles } from "./build.js";
import type { Templates } from "./templates.js";
import { loadTemplates } from "./templates.js";

export type WatchOptions = {
  templateDir: string;
  outDir: string;
  ext: string;
  workingDir: string;
  include: string[];
  ignore: string[];
  debounce: number;
  once: boolean;
  verbose: boolean;
  allowHtml: boolean;
};

type WatchContext = {
  inputAbs: string;
  outDirAbs: string;
  templateDirAbs: string;
  cwd: string;
  opts: WatchOptions;
  templates: Templates;
  changedFiles: Set<string>;
  debounceTimer: NodeJS.Timeout | null;
  isRebuilding: boolean;
};

/**
 * Get watch patterns based on input path and options
 */
async function getWatchPatterns(
  inputAbs: string,
  templateDirAbs: string,
  opts: WatchOptions,
): Promise<string[]> {
  const patterns: string[] = [];

  // Watch input files
  if (existsSync(inputAbs)) {
    const stat = await fs.stat(inputAbs);
    if (stat.isDirectory()) {
      // Watch all .md files in directory recursively
      patterns.push(path.join(inputAbs, "**", "*.md"));
    } else {
      // Watch specific file
      patterns.push(inputAbs);
    }
  }

  // Watch template directory if it exists
  if (existsSync(templateDirAbs)) {
    patterns.push(path.join(templateDirAbs, "**", "*.html"));
    patterns.push(path.join(templateDirAbs, "**", "*.css"));
  }

  // Add custom include patterns
  for (const pattern of opts.include) {
    const patternAbs = path.resolve(opts.workingDir, pattern);
    patterns.push(patternAbs);
  }

  return patterns;
}

/**
 * Get default ignore patterns
 */
function getIgnorePatterns(outDirAbs: string, opts: WatchOptions): string[] {
  const ignore: string[] = [
    "**/node_modules/**",
    "**/dist/**",
    "**/.git/**",
    `${outDirAbs}/**`, // Ignore output directory
  ];

  // Add custom ignore patterns
  for (const pattern of opts.ignore) {
    ignore.push(pattern);
  }

  return ignore;
}

/**
 * Schedule a rebuild after debounce
 */
function scheduleRebuild(ctx: WatchContext): void {
  if (ctx.debounceTimer) {
    clearTimeout(ctx.debounceTimer);
  }

  ctx.debounceTimer = setTimeout(() => {
    void runRebuild(ctx);
  }, ctx.opts.debounce);
}

/**
 * Run the rebuild process
 */
async function runRebuild(ctx: WatchContext): Promise<void> {
  if (ctx.isRebuilding) {
    if (ctx.opts.verbose) {
      console.log("[watch] rebuild already in progress, skipping...");
    }
    return;
  }

  ctx.isRebuilding = true;
  const startTime = Date.now();
  const changedFilesSnapshot = Array.from(ctx.changedFiles);
  ctx.changedFiles.clear();

  try {
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    console.log(`\n[${timestamp}] Rebuilding...`);

    if (ctx.opts.verbose && changedFilesSnapshot.length > 0) {
      console.log(
        `[watch] changed files: ${changedFilesSnapshot
          .map((f) => path.relative(ctx.cwd, f))
          .join(", ")}`,
      );
    }

    // Reload templates if any template files changed
    const hasTemplateChanges = changedFilesSnapshot.some((f) =>
      f.startsWith(ctx.templateDirAbs),
    );

    if (hasTemplateChanges) {
      if (ctx.opts.verbose) {
        console.log("[watch] reloading templates...");
      }
      ctx.templates = await loadTemplates(ctx.templateDirAbs);
    }

    // Build all markdown files
    const result = await buildMarkdownFiles(
      ctx.inputAbs,
      ctx.cwd,
      ctx.outDirAbs,
      ctx.opts.ext,
      ctx.templates,
      {
        verbose: ctx.opts.verbose,
        allowHtml: ctx.opts.allowHtml,
      },
    );

    const elapsed = Date.now() - startTime;
    if (result.ng > 0) {
      console.log(
        `[watch] ✗ Build failed: ${result.ok} ok, ${result.ng} errors (${elapsed}ms)`,
      );
    } else {
      console.log(
        `[watch] ✓ Build succeeded: ${result.ok} files (${elapsed}ms)`,
      );
    }
  } catch (e) {
    const elapsed = Date.now() - startTime;
    console.error(`[watch] ✗ Build failed (${elapsed}ms)`);
    console.error(e);
  } finally {
    ctx.isRebuilding = false;
  }
}

/**
 * Run the watch command
 */
export async function runWatch(
  inputAbs: string,
  opts: WatchOptions,
): Promise<number> {
  const cwd = opts.workingDir;
  const outDirAbs = path.resolve(cwd, opts.outDir);
  const templateDirAbs = path.resolve(cwd, opts.templateDir);

  // Validate input
  if (!existsSync(inputAbs)) {
    console.error(`ERROR: input path not found: ${inputAbs}`);
    return 1;
  }

  // Validate template directory
  if (!existsSync(templateDirAbs)) {
    console.error(`ERROR: template directory not found: ${templateDirAbs}`);
    return 1;
  }

  // Check for invalid args: directory input + file output
  const inputStat = await fs.stat(inputAbs);
  const isInputDir = inputStat.isDirectory();
  const isOutputLikeFile =
    !opts.outDir.endsWith("/") && opts.outDir.includes(".");

  if (isInputDir && isOutputLikeFile) {
    console.error(
      "ERROR: Cannot use directory input with file-like output. Use a directory for --out.",
    );
    return 2;
  }

  // Load templates
  const templates = await loadTemplates(templateDirAbs);

  // Get watch patterns and ignore patterns
  const watchPatterns = await getWatchPatterns(inputAbs, templateDirAbs, opts);
  const ignorePatterns = getIgnorePatterns(outDirAbs, opts);

  // Print startup info
  console.log("[watch] Starting watch mode...");
  console.log(`[watch] Input: ${path.relative(cwd, inputAbs)}`);
  console.log(`[watch] Output: ${path.relative(cwd, outDirAbs)}`);
  console.log(`[watch] Templates: ${path.relative(cwd, templateDirAbs)}`);
  console.log(`[watch] Debounce: ${opts.debounce}ms`);

  if (opts.verbose) {
    console.log(`[watch] Watch patterns: ${watchPatterns.length}`);
    for (const p of watchPatterns) {
      console.log(`  - ${path.relative(cwd, p)}`);
    }
    console.log(`[watch] Ignore patterns: ${ignorePatterns.length}`);
    for (const p of ignorePatterns) {
      console.log(`  - ${p}`);
    }
  }

  // Create watch context
  const ctx: WatchContext = {
    inputAbs,
    outDirAbs,
    templateDirAbs,
    cwd,
    opts,
    templates,
    changedFiles: new Set(),
    debounceTimer: null,
    isRebuilding: false,
  };

  // Run initial build
  await runRebuild(ctx);

  // If --once flag is set, exit after initial build
  if (opts.once) {
    console.log("[watch] --once flag set, exiting...");
    return 0;
  }

  // Start watching
  const watcher = chokidar.watch(watchPatterns, {
    ignored: ignorePatterns,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  // Set up event handlers
  watcher.on("add", (filePath: string) => {
    if (opts.verbose) {
      console.log(`[watch] added: ${path.relative(cwd, filePath)}`);
    }
    ctx.changedFiles.add(filePath);
    scheduleRebuild(ctx);
  });

  watcher.on("change", (filePath: string) => {
    if (opts.verbose) {
      console.log(`[watch] changed: ${path.relative(cwd, filePath)}`);
    }
    ctx.changedFiles.add(filePath);
    scheduleRebuild(ctx);
  });

  watcher.on("unlink", (filePath: string) => {
    if (opts.verbose) {
      console.log(`[watch] removed: ${path.relative(cwd, filePath)}`);
    }
    ctx.changedFiles.add(filePath);
    scheduleRebuild(ctx);
  });

  watcher.on("error", (error: unknown) => {
    console.error("[watch] Watcher error:", error);
  });

  watcher.on("ready", () => {
    console.log("[watch] Watching for changes... (Press Ctrl+C to stop)");
  });

  // Wait indefinitely
  return new Promise<number>((resolve) => {
    process.on("SIGINT", () => {
      console.log("\n[watch] Stopping...");
      void watcher.close().then(() => {
        console.log("[watch] Stopped.");
        resolve(0);
      });
    });

    process.on("SIGTERM", () => {
      console.log("\n[watch] Stopping...");
      void watcher.close().then(() => {
        console.log("[watch] Stopped.");
        resolve(0);
      });
    });
  });
}
