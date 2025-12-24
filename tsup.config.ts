import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  esbuildOptions(options) {
    options.banner ??= {};
    options.banner.js = "#!/usr/bin/env node";
  },
});
