import { defineConfig, devices } from "@playwright/test";

/** One end-to-end smoke test (PLAN.md, Tue). Uses the dev server, starting it if needed. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev --port 3000", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
