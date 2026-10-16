import "dotenv/config";
import { type Page } from "@playwright/test";
import { Client } from "pg";

import { expect, newUser, register, test } from "./fixtures";

/** Budgets through the real UI: limits, live spending, warnings, archive, months. */

const TZ = "Asia/Phnom_Penh";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const thisMonth = () => today().slice(0, 7);
function previousMonth(): string {
  const [y, m] = thisMonth().split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

async function addAccounts(email: string) {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    for (const name of ["ABA", "Wing"]) {
      await client.query(
        `INSERT INTO accounts (id, user_id, name, type, currency, opening_balance_minor, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'BANK', 'USD', 100000, now())`,
        [rows[0]!.id, name],
      );
    }
  } finally {
    await client.end();
  }
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

async function addBudget(
  page: Page,
  opts: { category: string; limit: string; month?: string; threshold?: string },
) {
  await page.goto(`/budgets/new${opts.month ? `?month=${opts.month}` : ""}`);
  await choose(page, "Expense category", opts.category);
  await page.getByLabel("Monthly limit").fill(opts.limit);
  if (opts.threshold)
    await page.getByRole("button", { name: `${opts.threshold}%`, exact: true }).click();
  await page.getByRole("button", { name: "Add budget" }).click();
  await expect(page).toHaveURL(/\/budgets\?month=\d{4}-\d{2}$/);
}

async function addExpense(page: Page, amount: string, category: string) {
  await page.goto("/transactions/new");
  await page.getByLabel("Amount").fill(amount);
  await choose(page, "Category", category);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
}

function budgetRow(page: Page, name: string) {
  return page.getByRole("listitem", { name });
}

test("a new user sees an empty month and can add a budget", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/budgets");
  await expect(page.getByRole("heading", { name: /^No budgets for/ })).toBeVisible();
  await page.getByRole("link", { name: "Add budget" }).first().click();
  await page.getByRole("button", { name: "Add budget" }).click();
  await expect(page.getByText("Choose a category.")).toBeVisible();
  await expect(page.getByText("Enter a limit.")).toBeVisible();
  await choose(page, "Expense category", "Food and drinks");
  await page.getByLabel("Monthly limit").fill("0");
  await page.getByRole("button", { name: "Add budget" }).click();
  await expect(page.getByText("Amount must be greater than zero.")).toBeVisible();
  await page.getByLabel("Monthly limit").fill("100");
  await page.getByRole("button", { name: "Add budget" }).click();
  const row = budgetRow(page, "Food and drinks (USD)");
  await expect(row.getByText("On track")).toBeVisible();
  await expect(row.getByText("$0.00 of $100.00 · 0% used")).toBeVisible();
  await expect(row.getByText("$100.00 left")).toBeVisible();
});

test.describe("with accounts", () => {
  test.beforeEach(async ({ page }) => {
    const user = await register(page, newUser("budget"));
    await addAccounts(user.email);
  });

  test("tracks real expenses, warns once per threshold and shows overspending", async ({
    page,
  }) => {
    await addBudget(page, { category: "Food and drinks", limit: "100" });
    const bell = page.getByRole("button", { name: /^Budget warnings/ });
    await expect(bell).toHaveAccessibleName("Budget warnings");

    await addExpense(page, "85", "Food and drinks");
    // A transfer is not spending.
    await page.goto("/transactions/new?type=transfer");
    await page.getByLabel("Amount").fill("500");
    await choose(page, "To account", /Wing/);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/transactions$/);

    await page.goto("/budgets");
    const row = budgetRow(page, "Food and drinks (USD)");
    await expect(row.getByText("Almost at limit")).toBeVisible();
    await expect(row.getByText("$85.00 of $100.00 · 85% used")).toBeVisible();
    await expect(row.getByRole("meter", { name: "Budget used" })).toHaveAttribute(
      "aria-valuetext",
      "85% used, $15.00 left",
    );
    await expect(bell).toHaveAccessibleName("Budget warnings, 1 unread");

    await addExpense(page, "5", "Food and drinks"); // 90 %: no new warning
    await addExpense(page, "15.50", "Food and drinks"); // 105.5 %
    await page.goto("/budgets");
    await expect(row.getByText("Over budget")).toBeVisible();
    await expect(row.getByText("Over by $5.50")).toBeVisible();
    await expect(row.getByText("· 105% used")).toBeVisible();
    await expect(bell).toHaveAccessibleName("Budget warnings, 2 unread");

    await bell.click();
    const menu = page.getByRole("menu");
    await expect(menu.getByText("Food and drinks: budget used up")).toBeVisible();
    await expect(menu.getByText("Food and drinks: 80% of budget used")).toBeVisible();
    await menu.getByRole("button", { name: "Mark all read" }).click();
    await expect(menu.getByRole("button", { name: "Mark all read" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(bell).toHaveAccessibleName("Budget warnings");
  });

  test("deleting an expense updates the budget", async ({ page }) => {
    await addBudget(page, { category: "Shopping", limit: "50" });
    await addExpense(page, "60", "Shopping");
    await page.goto("/budgets");
    await expect(budgetRow(page, "Shopping (USD)").getByText("Over budget")).toBeVisible();
    await page.goto("/transactions");
    await page.getByRole("list", { name: "Transactions" }).getByRole("link").first().click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await page.goto("/budgets");
    await expect(budgetRow(page, "Shopping (USD)").getByText("On track")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Budget warnings/ })).toHaveAccessibleName(
      "Budget warnings",
    );
  });

  test("edits, archives, restores and deletes a budget", async ({ page }) => {
    await addBudget(page, { category: "Transportation", limit: "40", threshold: "90" });
    const row = budgetRow(page, "Transportation (USD)");
    await expect(row.getByText("Warning at 90%")).toBeVisible();

    await row.getByRole("button", { name: "Actions for Transportation" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page.getByLabel("Monthly limit")).toHaveValue("40.00");
    await page.getByLabel("Monthly limit").fill("55.25");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(row.getByText("$55.25 left")).toBeVisible();

    await row.getByRole("button", { name: "Actions for Transportation" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("heading", { name: /^No budgets for/ })).toBeVisible();
    await page.getByText("Archived budgets (1)").click();
    await row.getByRole("button", { name: "Actions for Transportation" }).click();
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await expect(page.getByRole("heading", { name: "Budgets", level: 2 })).toBeVisible();

    await row.getByRole("button", { name: "Actions for Transportation" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: /^No budgets for/ })).toBeVisible();
  });

  test("navigates months and copies last month's budgets", async ({ page }) => {
    await addBudget(page, { category: "Utilities", limit: "30", month: previousMonth() });
    await page.goto("/budgets");
    await expect(page.getByRole("heading", { name: /^No budgets for/ })).toBeVisible();
    await page.getByRole("link", { name: "Previous month" }).click();
    await expect(page).toHaveURL(new RegExp(`month=${previousMonth()}`));
    await expect(budgetRow(page, "Utilities (USD)")).toBeVisible();
    await page.getByRole("link", { name: "Next month" }).click();
    await page.getByRole("button", { name: "Copy 1 from last month" }).click();
    await expect(budgetRow(page, "Utilities (USD)")).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy .* from last month/ })).toHaveCount(0);
  });

  test("shows unbudgeted spending with a shortcut to budget it", async ({ page }) => {
    await addExpense(page, "12", "Health");
    await page.goto("/budgets");
    const list = page.getByRole("list", { name: "Spending by category in USD" });
    await expect(list).toContainText("Health");
    await expect(list).toContainText("$12.00");
    await list.getByRole("link", { name: "Set budget for Health" }).click();
    await expect(page.getByRole("combobox", { name: "Expense category" })).toHaveText("Health");
  });
});
