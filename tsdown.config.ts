import { defineConfig } from "tsdown";

export default defineConfig({
  attw: {
    level: "error",
    profile: "esm-only",
  },
  entry: {
    index: "src/index.ts",
    "node/index": "src/node/index.ts",
  },
  clean: true,
  deps: {
    neverBundle: [/^node:/],
  },
  dts: true,
  format: "esm",
  platform: "neutral",
  publint: {
    level: "error",
  },
  sourcemap: false,
  target: "es2022",
});
