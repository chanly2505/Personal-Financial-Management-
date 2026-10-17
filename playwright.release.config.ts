import { defineConfig, devices } from "@playwright/test";

/**
 * Release checks against a DEPLOYED site (docs/OPERATIONS.md §Release checks):
 *   RELEASE_URL=https://your-site.vercel.app [RELEASE_CRON_SECRET=…] npm run release:check
 * Uses one throwaway test account with made-up sample data and deletes it at
 * the end. Never point it at a site whose data you cannot afford to add to.
 */
const baseURL = process.env.RELEASE_URL;
if (!baseURL)
  throw new Error("Set RELEASE_URL to the deployed site, e.g. https://example.vercel.app");

export default defineConfig({
  testDir: "./release",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  // Desktop browser; the phone layout is checked inside the main flow with a
  // Pixel 7 context, so one run needs only two sign-ups.
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
