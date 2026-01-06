import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type WatchCall = {
  paths: unknown;
  options: any;
};

type Handler = (...args: any[]) => unknown;

type MockState = {
  watchCalls: WatchCall[];
  handlers: Map<string, Handler[]>;
  watcher: {
    on: (event: string, cb: Handler) => unknown;
    close: ReturnType<typeof vi.fn>;
  };
  reset: () => void;
  emit: (event: string, ...args: any[]) => void;
  emitAsync: (event: string, ...args: any[]) => Promise<void>;
};

const state = vi.hoisted<MockState>(() => {
  const watchCalls: WatchCall[] = [];
  const handlers = new Map<string, Handler[]>();

  const watcher: MockState["watcher"] = {
    on: (event, cb) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
      return watcher;
    },
    close: vi.fn(),
  };

  const reset = () => {
    watchCalls.length = 0;
    handlers.clear();
    watcher.close.mockClear();
  };

  const emit = (event: string, ...args: any[]) => {
    for (const cb of handlers.get(event) ?? []) {
      cb(...args);
    }
  };

  const emitAsync = async (event: string, ...args: any[]) => {
    const list = handlers.get(event) ?? [];
    await Promise.all(list.map((cb) => cb(...args)));
  };

  return { watchCalls, handlers, watcher, reset, emit, emitAsync };
});

vi.mock("chokidar", () => {
  return {
    watch: (paths: unknown, options: unknown) => {
      state.watchCalls.push({ paths, options });
      return state.watcher;
    },
  };
});

describe("startWatch", () => {
  beforeEach(() => {
    vi.resetModules();
    state.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls chokidar.watch with expected paths and options", async () => {
    const { startWatch } = await import("../../src/watch.js");

    const inputAbs = "/repo/input";
    const templateAbs = "/repo/template";
    const outAbs = "/repo/out";

    startWatch({
      inputAbs,
      templateAbs,
      outAbs,
      debounceMs: 100,
      verbose: false,
      once: false,
      onBuild: async () => {},
    });

    expect(state.watchCalls).toHaveLength(1);

    const call = state.watchCalls[0];
    expect(call.paths).toEqual([inputAbs, templateAbs]);

    expect(call.options).toMatchObject({
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10,
      },
    });

    expect(typeof call.options.ignored).toBe("function");
  });

  it("sets persistent=false when once=true", async () => {
    const { startWatch } = await import("../../src/watch.js");

    startWatch({
      inputAbs: "/repo/input",
      templateAbs: "/repo/template",
      outAbs: "/repo/out",
      debounceMs: 0,
      verbose: false,
      once: true,
      onBuild: async () => {},
    });

    expect(state.watchCalls).toHaveLength(1);
    expect(state.watchCalls[0]?.options?.persistent).toBe(false);
  });

  it("ignores output directory subtree and common directories", async () => {
    const { startWatch } = await import("../../src/watch.js");

    const outAbs = "/repo/out";

    startWatch({
      inputAbs: "/repo/input",
      templateAbs: "/repo/template",
      outAbs,
      debounceMs: 0,
      verbose: false,
      once: false,
      onBuild: async () => {},
    });

    const ignored = state.watchCalls[0]?.options?.ignored as
      | ((p: string) => boolean)
      | undefined;

    expect(ignored).toBeTypeOf("function");
    if (!ignored) return;

    expect(ignored(outAbs)).toBe(true);
    expect(ignored(path.join(outAbs, "a.html"))).toBe(true);

    expect(ignored("/x/node_modules/y/file.md")).toBe(true);
    expect(ignored("/x/.git/config")).toBe(true);
    expect(ignored("/x/dist/bundle.js")).toBe(true);

    // Windows separators should also match
    expect(ignored("C:\\proj\\node_modules\\a.md")).toBe(true);

    // Should not accidentally ignore similar names
    expect(ignored("/x/distillery/file.md")).toBe(false);
  });

  it("filters events to only input .md and template/*.template.html (non-recursive)", async () => {
    vi.useFakeTimers();

    const { startWatch } = await import("../../src/watch.js");

    const inputAbs = "/repo/input";
    const templateAbs = "/repo/template";
    const outAbs = "/repo/out";

    const onBuild = vi.fn(async () => {});

    startWatch({
      inputAbs,
      templateAbs,
      outAbs,
      debounceMs: 100,
      verbose: false,
      once: false,
      onBuild,
    });

    state.emit("add", path.join(inputAbs, "a.md"));
    state.emit("change", path.join(inputAbs, "b.MD"));
    state.emit("change", path.join(inputAbs, "c.txt"));

    state.emit("change", path.join(templateAbs, "h2.template.html"));
    state.emit("change", path.join(templateAbs, "sub", "h2.template.html"));

    await vi.runAllTimersAsync();

    expect(onBuild).toHaveBeenCalledTimes(1);
  });

  it("debounces multiple events into a single build", async () => {
    vi.useFakeTimers();

    const { startWatch } = await import("../../src/watch.js");

    const inputAbs = "/repo/input";
    const templateAbs = "/repo/template";
    const outAbs = "/repo/out";

    const onBuild = vi.fn(async () => {});

    startWatch({
      inputAbs,
      templateAbs,
      outAbs,
      debounceMs: 100,
      verbose: false,
      once: false,
      onBuild,
    });

    state.emit("add", path.join(inputAbs, "a.md"));
    await vi.advanceTimersByTimeAsync(50);

    // Another event within the debounce window should reset the timer
    state.emit("change", path.join(inputAbs, "a.md"));

    await vi.advanceTimersByTimeAsync(100);

    expect(onBuild).toHaveBeenCalledTimes(1);
  });

  it("does not start a second build while one is in progress", async () => {
    vi.useFakeTimers();

    const { startWatch } = await import("../../src/watch.js");

    const inputAbs = "/repo/input";
    const templateAbs = "/repo/template";
    const outAbs = "/repo/out";

    let resolveFirst!: () => void;
    const firstBuild = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    let calls = 0;
    const onBuild = vi.fn(() => {
      calls++;
      if (calls === 1) return firstBuild;
      return Promise.resolve();
    });

    startWatch({
      inputAbs,
      templateAbs,
      outAbs,
      debounceMs: 100,
      verbose: false,
      once: false,
      onBuild,
    });

    state.emit("change", path.join(inputAbs, "a.md"));
    await vi.advanceTimersByTimeAsync(100);

    // Build is now in-progress (firstBuild unresolved)
    expect(onBuild).toHaveBeenCalledTimes(1);

    state.emit("change", path.join(inputAbs, "b.md"));
    await vi.advanceTimersByTimeAsync(100);

    // Should be skipped due to "building" guard
    expect(onBuild).toHaveBeenCalledTimes(1);

    resolveFirst();
    await Promise.resolve();

    state.emit("change", path.join(inputAbs, "c.md"));
    await vi.advanceTimersByTimeAsync(100);

    expect(onBuild).toHaveBeenCalledTimes(2);
  });

  it("runs initial build and closes when once=true on ready", async () => {
    const { startWatch } = await import("../../src/watch.js");

    const onBuild = vi.fn(async () => {});

    startWatch({
      inputAbs: "/repo/input",
      templateAbs: "/repo/template",
      outAbs: "/repo/out",
      debounceMs: 0,
      verbose: false,
      once: true,
      onBuild,
    });

    await state.emitAsync("ready");

    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(state.watcher.close).toHaveBeenCalledTimes(1);
  });
});
