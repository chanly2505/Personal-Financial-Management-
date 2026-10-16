import { type Page, expect, test } from "@playwright/test";

import { register } from "./fixtures";

// Every page in the shell requires a session: sign up a fresh user first.
test.beforeEach(async ({ page }) => {
  await register(page);
});

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const MODULES = [
  { path: "/dashboard", title: "Dashboard" },
  { path: "/transactions", title: "Transactions" },
  { path: "/accounts", title: "Accounts" },
  { path: "/budgets", title: "Budgets" },
  { path: "/categories", title: "Categories" },
  { path: "/recurring", title: "Recurring" },
  { path: "/goals", title: "Savings goals" },
  { path: "/reports", title: "Reports" },
  { path: "/settings", title: "Settings" },
];

test.describe("module placeholders", () => {
  for (const { path, title } of MODULES.filter(
    (m) =>
      ![
        "/settings",
        "/accounts",
        "/categories",
        "/transactions",
        "/dashboard",
        "/budgets",
        "/recurring",
        "/goals",
      ].includes(m.path),
  )) {
    test(`${path} renders inside the shell and is clearly not available yet`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page).toHaveTitle(`${title} · Personal Finance`);
      await expect(page.getByText("Not available yet")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeAttached();
      await expectNoHorizontalOverflow(page);
    });
  }
});

test("desktop sidebar shows labels and marks the current page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop layout only");
  await page.goto("/accounts");
  const nav = page.getByRole("navigation", { name: "Main" });
  const current = nav.getByRole("link", { name: "Accounts" });
  await expect(current).toBeVisible();
  await expect(current).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reports");
});

test("tablet shows the icon rail with accessible names", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "tablet", "tablet layout only");
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Main" });
  const link = nav.getByRole("link", { name: "Budgets" });
  await expect(link).toBeVisible();
  // Label text is visually hidden on the rail, so the rail stays narrow.
  const box = await nav.boundingBox();
  expect(box?.width ?? 0).toBeLessThan(100);
  await link.click();
  await expect(page).toHaveURL(/\/budgets$/);
});

test("phone uses bottom navigation with a More sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout only");
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Transactions" })).toBeVisible();
  await nav.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("link", { name: "Savings goals" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/goals$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Savings goals");
});

test("skip link moves focus to the main content", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "keyboard check on keyboard devices");
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("unknown URLs show the not-found page with a 404 status", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("health endpoint confirms database connectivity", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", database: "ok" });
});
