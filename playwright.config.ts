import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests. Run only against the separate QA project with labeled
 * synthetic accounts — never production data. Files end in .e2e.ts so the
 * unit test run never picks them up.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env["CI"] ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:8080",
    viewport: { width: 1280, height: 1800 },
    navigationTimeout: 45_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1800 } } }],
});
