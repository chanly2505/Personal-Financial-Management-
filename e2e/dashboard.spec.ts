import "dotenv/config";
import { type Page } from "@playwright/test";
import { Client } from "pg";

import { expect, newUser, register, test } from "./fixtures";

/**
 * Dashboard against known records. Expected figures are computed by hand:
 *
 * This month (today):  +1,000.00 salary, −250.00 rent, −50.00 food (USD, ABA)
 *                      transfer ABA → Wing 100.00 (not counted)
 *                      −20,000 KHR transport (Cash)
 *   → USD income 1,000.00, expenses 300.00, net 700.00, savings 70.0 %
 *   → KHR income 0, expenses 20,000, savings rate "—" (no income)
 * Last month (15th):   +500.00 salary, −125.00 food (USD)
 *   → income 500.00, expenses 125.00, net 375.00, savings 75.0 %
 */

const TZ = "Asia/Phnom_Penh";

function todayInTz(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function fifteenthOfLastMonth(today: string): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 2, 15));
  return date.toISOString().slice(0, 10);
}

async function seedLedger(email: string) {
  const today = todayInTz();
  const lastMonth = fifteenthOfLastMonth(today);
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    const userId = rows[0]?.id;
    if (!userId) throw new Error("user not found");
    const account = async (name: string, currency: string, opening: number) =>
      (
        await client.query<{ id: string }>(
          `INSERT INTO accounts (id, user_id, name, type, currency, opening_balance_minor, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'BANK', $3, $4, now()) RETURNING id`,
          [userId, name, currency, opening],
        )
      ).rows[0]!.id;
    const category = async (name: string) =>
      (
        await client.query<{ id: string }>(
          "SELECT id FROM categories WHERE user_id = $1 AND name = $2",
          [userId, name],
        )
      ).rows[0]!.id;
    const aba = await account("ABA", "USD", 0);
    const wing = await account("Wing", "USD", 0);
    const cash = await account("Cash", "KHR", 100000);
    const entry = async (
      type: string,
      accountId: string,
      categoryName: string,
      amount: number,
      on: string,
      payee: string,
    ) =>
      client.query(
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount_minor, occurred_on, payee, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now())`,
        [userId, accountId, await category(categoryName), type, amount, on, payee],
      );
    await entry("INCOME", aba, "Salary", 100000, today, "Employer");
    await entry("EXPENSE", aba, "Housing and rent", 25000, today, "Landlord");
    await entry("EXPENSE", aba, "Food and drinks", 5000, today, "Lucky");
    await entry("EXPENSE", cash, "Transportation", 20000, today, "PassApp");
    await entry("INCOME", aba, "Salary", 50000, lastMonth, "Employer (last month)");
    await entry("EXPENSE", aba, "Food and drinks", 12500, lastMonth, "Market (last month)");
    await client.query(
      `INSERT INTO transfers (id, user_id, from_account_id, to_account_id, from_amount_minor, to_amount_minor, occurred_on, note, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 10000, 10000, $4, 'Top up', now())`,
      [userId, aba, wing, today],
    );
  } finally {
    await client.end();
  }
}

function tile(page: Page, label: string) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByText(label, { exact: true }) });
}

test("a new user is guided to add an account", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Start by adding an account" })).toBeVisible();
  await expect(page.getByText("Not available yet")).toHaveCount(0);
});

test.describe("with records", () => {
  test.beforeEach(async ({ page }) => {
    const user = await register(page, newUser("dash"));
    await seedLedger(user.email);
    await page.goto("/dashboard");
  });

  test("summarises this month per currency, excluding transfers", async ({ page }) => {
    await expect(tile(page, "Income · USD")).toContainText("$1,000.00");
    await expect(tile(page, "Expenses · USD")).toContainText("$300.00");
    await expect(tile(page, "Left over · USD")).toContainText("$700.00");
    await expect(tile(page, "Share of income kept · USD")).toContainText("70.0%");
    await expect(tile(page, "Expenses · KHR")).toContainText("៛20,000");
    await expect(tile(page, "Share of income kept · KHR")).toContainText("—");
    await expect(tile(page, "Share of income kept · KHR")).toContainText(
      "No income in this period",
    );

    // Balances are today's, separate from the period, and include last month:
    // ABA 1,000 − 250 − 50 − 100 + 500 − 125 = 975.00; Wing 100.00; total 1,075.00.
    const balances = page.getByRole("region", { name: "Total in US Dollar" });
    await expect(balances.getByText("$1,075.00").first()).toBeVisible();
    await expect(balances.getByRole("list", { name: "Account balances in USD" })).toContainText(
      "ABA$975.00Wing$100.00",
    );

    const category = page.getByRole("list", { name: "Spending by category" });
    await expect(category).toContainText("Housing and rent");
    await expect(category).toContainText("$250.00 · 83.3%");
    await expect(category).toContainText("$50.00 · 16.7%");

    const recent = page.getByRole("region", { name: "Recent transactions" });
    await expect(recent.getByText("Top up")).toBeVisible();
    await expect(recent.getByText("Employer (last month)")).toHaveCount(0);
  });

  test("changing the period updates every widget together", async ({ page, isMobile }) => {
    if (isMobile) {
      await page.getByRole("combobox", { name: "Period" }).click();
      await page.getByRole("option", { name: "Last month" }).click();
    } else {
      await page.getByRole("button", { name: "Last month" }).click();
      await expect(page.getByRole("button", { name: "Last month" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    await expect(page).toHaveURL(/period=last_month/);
    await expect(tile(page, "Income · USD")).toContainText("$500.00");
    await expect(tile(page, "Expenses · USD")).toContainText("$125.00");
    await expect(tile(page, "Left over · USD")).toContainText("$375.00");
    await expect(tile(page, "Share of income kept · USD")).toContainText("75.0%");
    await expect(tile(page, "Expenses · KHR")).toContainText("៛0");
    const recent = page.getByRole("region", { name: "Recent transactions" });
    await expect(recent.getByText("Employer (last month)")).toBeVisible();
    await expect(recent.getByText("Top up")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Spending by category" })).toContainText(
      "$125.00 · 100.0%",
    );
    // Balances do not depend on the period.
    await expect(
      page.getByRole("region", { name: "Total in US Dollar" }).getByRole("list"),
    ).toContainText("ABA$975.00");
  });

  test("a custom range with nothing in it shows empty states, not fake data", async ({ page }) => {
    await page.goto("/dashboard?period=custom&from=2020-01-01&to=2020-01-31");
    await expect(page.getByText("Custom range: 1 Jan – 31 Jan 2020")).toBeVisible();
    await expect(tile(page, "Income · USD")).toContainText("$0.00");
    await expect(
      page.getByRole("heading", { name: "No income or expenses in this period" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "No spending in this period" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nothing recorded in this period" }),
    ).toBeVisible();
  });

  test("custom range form applies dates", async ({ page, isMobile }) => {
    if (isMobile) {
      await page.getByRole("combobox", { name: "Period" }).click();
      await page.getByRole("option", { name: "Custom range" }).click();
    } else {
      await page.getByRole("button", { name: "Custom range" }).click();
    }
    const form = page.getByRole("form", { name: "Custom date range" });
    await form.getByLabel("From").fill("2020-01-01");
    await form.getByLabel("To").fill("2020-12-31");
    await form.getByRole("button", { name: "Apply range" }).click();
    await expect(page).toHaveURL(/period=custom&from=2020-01-01&to=2020-12-31/);
    await expect(page.getByText("Custom range: 1 Jan – 31 Dec 2020")).toBeVisible();
  });

  test("charts have a table view with the same numbers, and switch currency", async ({ page }) => {
    const flow = page.getByRole("region", { name: "Income vs expenses" });
    await expect(flow.getByRole("img")).toBeVisible();
    await flow.getByText("Show as table").click();
    const table = flow.getByRole("table");
    await expect(table).toContainText("$1,000.00");
    await expect(table).toContainText("$300.00");

    await page
      .getByRole("navigation", { name: "Chart currency" })
      .getByRole("link", { name: "KHR" })
      .click();
    await expect(page).toHaveURL(/currency=KHR/);
    await expect(page.getByRole("heading", { name: "Charts in Cambodian Riel" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Spending by category" })).toContainText(
      "៛20,000 · 100.0%",
    );
  });

  test("recent transactions link to the ledger for the same range", async ({ page }) => {
    await page
      .getByRole("region", { name: "Recent transactions" })
      .getByRole("link", { name: "View all" })
      .click();
    await expect(page).toHaveURL(/\/transactions\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}/);
    // The ledger's totals for the same range match the dashboard.
    await expect(page.getByText("+$1,000.00").first()).toBeVisible();
    await expect(page.getByText("-$300.00").first()).toBeVisible();
  });
});
