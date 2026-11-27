import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/smoke",
  testMatch: "**/*.spec.ts",
  globalSetup: "./test/smoke/global-setup.ts",
  outputDir: ".next-smoke/results",
  reporter: "list",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
