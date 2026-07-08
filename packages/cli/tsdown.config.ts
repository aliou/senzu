import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli/index.ts"],
  format: "esm",
  outDir: "dist",
  platform: "node",
  target: "node24",
  dts: false,
  sourcemap: true,
  clean: true,
  banner: "#!/usr/bin/env node",
});
