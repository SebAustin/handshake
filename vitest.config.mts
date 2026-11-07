import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `pnpm test` runs fast unit tests only; `pnpm test:int` runs *.int.test.ts against real services;
// `pnpm eval:arbiter` runs *.eval.test.ts against the real models (costs model calls).
const integration = process.env.VITEST_INTEGRATION === "1";
const evals = process.env.VITEST_EVAL === "1";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: evals ? ["src/**/*.eval.test.ts"] : integration ? ["src/**/*.int.test.ts"] : ["src/**/*.test.ts"],
    exclude: evals || integration ? [] : ["src/**/*.int.test.ts", "src/**/*.eval.test.ts"],
    testTimeout: evals ? 180_000 : integration ? 30_000 : 5_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
