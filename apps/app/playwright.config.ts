import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
});
