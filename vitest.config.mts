import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `pnpm test` runs fast unit tests only; `pnpm test:int` runs *.int.test.ts against real services.
const integration = process.env.VITEST_INTEGRATION === "1";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: integration ? ["src/**/*.int.test.ts"] : ["src/**/*.test.ts"],
    exclude: integration ? [] : ["src/**/*.int.test.ts"],
    testTimeout: integration ? 30_000 : 5_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
