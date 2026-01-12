import path from "node:path";
import { watch as chokidarWatch, type FSWatcher } from "chokidar";

export type WatchOptions = {
  inputAbs: string;
  templateAbs: string;
  outAbs: string;
  debounceMs: number;
  verbose: boolean;
  once: boolean;
  onBuild: () => Promise<void>;
};

const IGNORED_DIRS = ["node_modules", ".git", "dist"];

function isUnderDir(filePath: string, dirAbs: string): boolean {
  return filePath === dirAbs || filePath.startsWith(dirAbs + path.sep);
}

function buildIgnored(outAbs: string): (filePath: string) => boolean {
  const ignoredDirRegexes = IGNORED_DIRS.map(
    (dir) => new RegExp(`(^|[\\\\/])${dir}([\\\\/]|$)`),
  );

  return (filePath: string) => {
    if (isUnderDir(filePath, outAbs)) return true;
    return ignoredDirRegexes.some((re) => re.test(filePath));
  };
}

export function startWatch(opts: WatchOptions): FSWatcher {
  const { inputAbs, templateAbs, outAbs, debounceMs, verbose, once, onBuild } =
    opts;

  const ignored = buildIgnored(outAbs);

  // Watched paths: input (*.md) + template dir (*.template.html, non-recursive)
  const watchedPaths = [inputAbs, templateAbs];

  const watcher = chokidarWatch(watchedPaths, {
    ignored,
    persistent: !once,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 50,
      pollInterval: 10,
    },
  });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let building = false;

  const scheduleBuild = (eventPath: string, eventType: string) => {
    // Filter: only react to .md files for input, .template.html for templates
    const isMd = eventPath.toLowerCase().endsWith(".md");
    const isTemplate = eventPath.toLowerCase().endsWith(".template.html");

    // Check if path is under template directory (non-recursive)
    const isInTemplateDir =
      path.dirname(eventPath) === templateAbs && isTemplate;
    // Check if path is under input (could be nested)
    const isInInput =
      (eventPath.startsWith(inputAbs + path.sep) || eventPath === inputAbs) &&
      isMd;

    if (!isInTemplateDir && !isInInput) {
      return;
    }

    if (verbose) {
      console.log(`[watch] ${eventType}: ${eventPath}`);
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      debounceTimer = null;

      if (building) {
        if (verbose) {
          console.log("[watch] build already in progress, skipping");
        }
        return;
      }

      building = true;
      try {
        if (verbose) {
          console.log("[watch] rebuilding...");
        }
        await onBuild();
        if (verbose) {
          console.log("[watch] rebuild complete");
        }
      } catch (e) {
        console.error("[watch] build error (will retry on next change):");
        console.error(e);
      } finally {
        building = false;
      }

      if (once) {
        watcher.close();
      }
    }, debounceMs);
  };

  watcher.on("add", (p) => scheduleBuild(p, "add"));
  watcher.on("change", (p) => scheduleBuild(p, "change"));
  watcher.on("unlink", (p) => scheduleBuild(p, "unlink"));

  watcher.on("ready", async () => {
    if (verbose) {
      console.log("[watch] watching for changes...");
    }

    // For --once mode, run initial build immediately
    if (once) {
      building = true;
      try {
        await onBuild();
      } catch (e) {
        console.error("[watch] initial build error:");
        console.error(e);
      } finally {
        building = false;
        watcher.close();
      }
    }
  });

  watcher.on("error", (error) => {
    console.error("[watch] watcher error:", error);
  });

  return watcher;
}
