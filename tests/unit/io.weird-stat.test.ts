import { describe, expect, it, vi } from "vitest";

describe("collectMarkdownFiles (weird stat)", () => {
  it("returns [] when path exists but is neither file nor directory", async () => {
    vi.resetModules();

    vi.mock("node:fs", () => ({
      existsSync: () => true,
    }));

    vi.mock("node:fs/promises", () => ({
      default: {
        stat: async () => ({
          isFile: () => false,
          isDirectory: () => false,
        }),
      },
    }));

    const { collectMarkdownFiles } = await import("../../src/io.js");

    const files = await collectMarkdownFiles("/some/special");
    expect(files).toEqual([]);
  });
});
