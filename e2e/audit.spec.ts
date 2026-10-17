import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";

import { expect, newUser, register, test } from "./fixtures";
import { seedEverything } from "./seed";

/**
 * Consistency and accessibility sweep over every page, on desktop, tablet and
 * phone (docs/UI_GUIDELINES.md, WCAG 2.2 AA where automated checks apply):
 * one h1, "<Title> · Personal Finance" page titles, no sideways page scroll,
 * and no axe-core violations of the WCAG 2.0/2.1/2.2 A and AA rules.
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

test.describe("signed out", () => {
  for (const [path, title] of [
    ["/sign-in", "Sign in"],
    ["/register", "Create account"],
    ["/no-such-page", "Page not found"],
  ] as const) {
    test(`${path}`, async ({ page }) => {
      await audit(page, path, title);
    });
  }
});

test.describe("signed in, with data", () => {
  test.describe.configure({ mode: "serial" });
  let ids: Awaited<ReturnType<typeof seedEverything>>;

  test.beforeEach(async ({ page }) => {
    const user = await register(page, newUser("audit"));
    ids = await seedEverything(user.email);
  });

  test("every page", async ({ page }) => {
    test.setTimeout(240_000);
    const pages: [string, string][] = [
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
    for (const [path, title] of pages) await audit(page, path, title);
  });
});
