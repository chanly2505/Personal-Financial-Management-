import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";

import { expect, newUser, register, test } from "./fixtures";
import { seedEverything } from "./seed";

/**
 * Consistency and accessibility sweep over every page, on desktop, tablet and
 * phone (docs/UI_GUIDELINES.md, WCAG 2.2 AA where automated checks apply):
 * one h1, "<Title> · Personal Finance" page titles, no sideways page scroll,
 * no duplicate element ids (labels and descriptions would point at the wrong
 * element; axe no longer checks this under WCAG 2.2), and no axe-core violations of the WCAG 2.0/2.1/2.2 A and AA rules. The dark
 * theme is swept again on desktop (colour contrast does not depend on width).
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function audit(page: Page, path: string, title: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect.soft(page.locator("h1"), `${path} h1`).toHaveCount(1);
  await expect.soft(page).toHaveTitle(`${title} · Personal Finance`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect.soft(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  const duplicateIds = await page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  });
  expect.soft(duplicateIds, `${path} duplicate ids`).toEqual([]);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes
        .map((n) => `${n.target.join(" ")} ${n.html.slice(0, 140)}`)
        .slice(0, 3)
        .join(" | ")}`,
  );
  expect.soft(summary, `${path} accessibility`).toEqual([]);
}

type Ids = Awaited<ReturnType<typeof seedEverything>>;

function signedInPages(ids: Ids): [string, string][] {
  return [
    ["/dashboard", "Dashboard"],
    ["/transactions", "Transactions"],
    ["/transactions/new", "Add transaction"],
    [`/transactions/${ids.transactionId}`, "Transaction"],
    [`/transactions/${ids.transactionId}/edit`, "Edit transaction"],
    [`/transactions/${ids.transferId}`, "Transaction"],
    ["/accounts", "Accounts"],
    ["/accounts/new", "Add account"],
    [`/accounts/${ids.aba}`, "ABA"],
    [`/accounts/${ids.aba}/edit`, "Edit account"],
    ["/categories", "Categories"],
    ["/budgets", "Budgets"],
    ["/budgets/new", "Add budget"],
    [`/budgets/${ids.budgetId}/edit`, "Edit budget"],
    ["/recurring", "Recurring"],
    ["/recurring/new", "Add recurring transaction"],
    [`/recurring/${ids.ruleId}`, "Phone bill"],
    [`/recurring/${ids.ruleId}/edit`, "Edit recurring transaction"],
    ["/goals", "Savings goals"],
    ["/goals/new", "Add savings goal"],
    [`/goals/${ids.goalId}`, "Emergency fund"],
    [`/goals/${ids.goalId}/edit`, "Edit savings goal"],
    ["/reports", "Reports"],
    ["/reports?report=income", "Reports"],
    ["/reports?report=categories", "Reports"],
    [`/reports?report=account&accountId=${ids.aba}`, "Reports"],
    ["/reports?report=budgets", "Reports"],
    ["/reports?report=compare", "Reports"],
    ["/settings", "Settings"],
  ];
}

test.describe("signed out", () => {
  for (const [path, title] of [
    ["/sign-in", "Sign in"],
    ["/register", "Create account"],
    ["/privacy", "Privacy"],
    ["/no-such-page", "Page not found"],
  ] as const) {
    test(`${path}`, async ({ page }) => {
      await audit(page, path, title);
    });
  }
});

test.describe("signed in, with data", () => {
  test.describe.configure({ mode: "serial" });
  let ids: Ids;

  test.beforeEach(async ({ page }) => {
    const user = await register(page, newUser("audit"));
    ids = await seedEverything(user.email);
  });

  test("every page", async ({ page }) => {
    test.setTimeout(240_000);
    for (const [path, title] of signedInPages(ids)) await audit(page, path, title);
  });
});

test.describe("signed in, before adding anything", () => {
  test("every list page explains what to do next, without errors", async ({ page }) => {
    test.setTimeout(120_000);
    await register(page, newUser("audit-empty"));
    for (const [path, title] of [
      ["/dashboard", "Dashboard"],
      ["/transactions", "Transactions"],
      ["/transactions/new", "Add transaction"],
      ["/accounts", "Accounts"],
      ["/categories", "Categories"],
      ["/budgets", "Budgets"],
      ["/recurring", "Recurring"],
      ["/recurring/new", "Add recurring transaction"],
      ["/goals", "Savings goals"],
      ["/reports", "Reports"],
      ["/settings", "Settings"],
    ] as const) {
      await audit(page, path, title);
      await expect.soft(page.getByText("Something went wrong"), path).toHaveCount(0);
      // A first step is always offered: a link or button inside the page content.
      await expect
        .soft(
          page
            .locator("main")
            .getByRole("link")
            .or(page.locator("main").getByRole("button"))
            .first(),
          path,
        )
        .toBeVisible();
    }
  });
});

test.describe("dark theme", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ context, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "colour contrast is checked once, on desktop");
    await context.addCookies([{ name: "theme", value: "dark", url: baseURL! }]);
  });

  test("signed-out pages", async ({ page }) => {
    for (const [path, title] of [
      ["/sign-in", "Sign in"],
      ["/register", "Create account"],
      ["/privacy", "Privacy"],
      ["/no-such-page", "Page not found"],
    ] as const) {
      await audit(page, path, title);
    }
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });

  test("every signed-in page", async ({ page }) => {
    test.setTimeout(240_000);
    const user = await register(page, newUser("audit-dark"));
    const ids = await seedEverything(user.email);
    for (const [path, title] of signedInPages(ids)) await audit(page, path, title);
  });
});
