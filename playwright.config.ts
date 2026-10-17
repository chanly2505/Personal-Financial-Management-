import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

// Use a pre-installed Chromium when provided (e.g. CI images or cloud sandboxes)
// instead of downloading the version pinned by @playwright/test.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  // Three device classes from docs/UI_GUIDELINES.md §4, all on Chromium.
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      // A production build against the dedicated e2e database.
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      AUTH_URL: baseURL,
      MAIL_TRANSPORT: "none",
      ENABLE_DESIGN_SYSTEM_PAGE: "true",
      // Lets e2e tests trigger the recurring scheduler like a hosted cron would.
      CRON_SECRET: "e2e-cron-secret-0123456789abcdefghijklmnop",
      // The suite registers hundreds of users without a client IP (QA-12 limit).
      REGISTRATION_LIMIT_WITHOUT_IP: "1000000",
    },
  },
});
