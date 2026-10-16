import "dotenv/config";
import { readFileSync } from "node:fs";

import { type Page } from "@playwright/test";
import { Client } from "pg";

import { expect, newUser, register, test } from "./fixtures";

/**
 * Reports and CSV export against known records (fixed March 2026 dates, so the
 * figures never depend on today). Expected numbers are worked out by hand:
 *
 * USD  ABA (opening 100.00), Wing (0)     KHR  Cash (opening 50,000)
 * 02-28 +1,000.00 Salary ABA            03-01 +2,000.00 Salary ABA "Employer"
 * 03-02   −500.00 Rent ABA "Landlord"   03-15    −12.50 Food ABA "=cmd" (formula!)
 * 03-20  transfer ABA → Wing 100.00     03-25     −7.50 Food Wing 'Lucky, "Mall"'
 * 03-31  −20,000 KHR Transport Cash     03-31    +40.00 Other income Wing "Gift"
 *
 * March USD: income 2,040.00, expenses 520.00, net 1,520.00 (6 records)
 * March KHR: expenses 20,000 (1 record)
 */

const MARCH = "/reports?period=custom&from=2026-03-01&to=2026-03-31";

async function seed(email: string) {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    const userId = (
      await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email])
    ).rows[0]!.id;
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
    const aba = await account("ABA", "USD", 10000);
    const wing = await account("Wing", "USD", 0);
    const cash = await account("Cash", "KHR", 50000);
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
    await entry("INCOME", aba, "Salary", 100000, "2026-02-28", "Feb salary");
    await entry("INCOME", aba, "Salary", 200000, "2026-03-01", "Employer");
    await entry("EXPENSE", aba, "Housing and rent", 50000, "2026-03-02", "Landlord");
    await entry("EXPENSE", aba, "Food and drinks", 1250, "2026-03-15", "=cmd");
    await client.query(
      `INSERT INTO transfers (id, user_id, from_account_id, to_account_id, from_amount_minor, to_amount_minor, occurred_on, note, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 10000, 10000, '2026-03-20', 'Top up', now())`,
      [userId, aba, wing],
    );
    await entry("EXPENSE", wing, "Food and drinks", 750, "2026-03-25", 'Lucky, "Mall"');
    await entry("EXPENSE", cash, "Transportation", 20000, "2026-03-31", "PassApp");
    await entry("INCOME", wing, "Other income", 4000, "2026-03-31", "Gift");
  } finally {
    await client.end();
  }
}

function totals(page: Page, label: string) {
  return page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function download(page: Page) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  return { name: file.suggestedFilename(), text: readFileSync((await file.path())!, "utf8") };
}

test("a user without accounts is told what to do first", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reports");
  await expect(page.getByRole("heading", { name: "Nothing to report yet" })).toBeVisible();
  await expect(page.getByText("Not available yet")).toHaveCount(0);
});

test.describe("with records", () => {
  test.beforeEach(async ({ page }) => {
    const user = await register(page, newUser("reports"));
    await seed(user.email);
    await page.goto(MARCH);
  });

  test("cash flow totals match the records, per currency, without transfers", async ({ page }) => {
    await expect(
      page.getByText("Custom range: 1 Mar – 31 Mar 2026").filter({ visible: true }),
    ).toBeVisible();
    await expect(totals(page, "Income · USD")).toContainText("$2,040.00");
    await expect(totals(page, "Expenses · USD")).toContainText("$520.00");
    await expect(totals(page, "Net · USD")).toContainText("$1,520.00");
    await expect(totals(page, "Expenses · KHR")).toContainText("៛20,000");
    const table = page.getByRole("table", { name: "Cash flow per day in USD" });
    await expect(table.getByRole("row", { name: /^1 Mar 2026/ })).toContainText("$2,000.00");
    await expect(table.locator("tfoot")).toContainText("+$1,520.00");
    await expect(page.getByRole("link", { name: "View the 7 records" })).toHaveAttribute(
      "href",
      "/transactions?from=2026-03-01&to=2026-03-31",
    );
    await expectNoHorizontalOverflow(page);
  });

  test("every report opens from the tabs and keeps the filters", async ({ page }) => {
    const tabs = page.getByRole("navigation", { name: "Reports" });

    await tabs.getByRole("link", { name: "By category" }).click();
    await expect(page).toHaveURL(/report=categories/);
    await expect(
      page.getByRole("table", { name: /Spending by category in USD/ }).getByRole("row", {
        name: /Housing and rent/,
      }),
    ).toContainText("96.2%");

    await tabs.getByRole("link", { name: "Income" }).click();
    await expect(page.getByRole("heading", { name: "Income in USD: $2,040.00" })).toBeVisible();

    await tabs.getByRole("link", { name: "Expenses" }).click();
    await expect(page.getByRole("heading", { name: "Expenses in KHR: ៛20,000" })).toBeVisible();

    await tabs.getByRole("link", { name: "Compare periods" }).click();
    await expect(page.getByText("1 Feb – 28 Feb 2026")).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Totals compared in USD" }).getByRole("row", {
        name: /Income/,
      }),
    ).toContainText("+$1,040.00");

    await tabs.getByRole("link", { name: "Account history" }).click();
    await page.getByRole("link", { name: "ABA · USD" }).click();
    // 100 + 1,000 opening; +2,000 −500 −12.50 −100 → 2,487.50.
    await expect(totals(page, "Opening balance")).toContainText("$1,100.00");
    await expect(totals(page, "Closing balance")).toContainText("$2,487.50");
    await expect(
      page.getByText("Opening balance + money in − money out = closing balance."),
    ).toBeVisible();
    await expect(page).toHaveURL(/from=2026-03-01/);

    await tabs.getByRole("link", { name: "Budgets" }).click();
    await expect(page.getByRole("heading", { name: "No budgets in this period" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("the filter bar narrows every figure", async ({ page, isMobile }) => {
    if (isMobile) {
      // Phones: the filters are folded away behind a button.
      await expect(page.getByRole("combobox", { name: "Currency" })).toBeHidden();
      await page.getByRole("button", { name: "Filters" }).click();
    }
    await page.getByRole("combobox", { name: "Currency" }).click();
    await page.getByRole("option", { name: "KHR" }).click();
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/currency=KHR/);
    await expect(totals(page, "Expenses · KHR")).toContainText("៛20,000");
    await expect(totals(page, "Income · USD")).toHaveCount(0);
    if (isMobile) await page.getByRole("button", { name: /Filters/ }).click();

    await page.getByRole("combobox", { name: "Group by" }).click();
    await page.getByRole("option", { name: "Yearly" }).click();
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/granularity=year/);
    await expect(page.getByRole("table", { name: "Cash flow per year in KHR" })).toContainText(
      "2026",
    );
  });

  test("exports the report's records as CSV, safely escaped", async ({ page }) => {
    const { name, text } = await download(page);
    expect(name).toMatch(/^transactions-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = text.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe(
      "Date,Type,Amount,Currency,Account,To account,Category,Payee,Note,Reversal,Record ID",
    );
    expect(lines.filter(Boolean)).toHaveLength(8); // header + 7 March records, oldest first
    expect(lines[1]).toMatch(/^2026-03-01,Income,2000\.00,USD,ABA,,Salary,Employer,,,/);
    expect(text).toContain("2026-03-15,Expense,12.50,USD,ABA,,Food and drinks,'=cmd,");
    expect(text).toContain('Food and drinks,"Lucky, ""Mall""",');
    expect(text).toContain("2026-03-20,Transfer,100.00,USD,ABA,Wing,,,Top up,,");
    expect(text).toContain("2026-03-31,Expense,20000,KHR,Cash,,Transportation,PassApp,");
    expect(text).not.toContain("Feb salary");
  });

  test("the transactions list exports exactly its filtered records", async ({ page }) => {
    await page.goto("/transactions?q=Lucky");
    await expect(page.getByText("1 record matches")).toBeVisible();
    const { text } = await download(page);
    const lines = text.replace(/^﻿/, "").split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Lucky, ""Mall"""');
  });
});

test("exports require a session", async ({ request }) => {
  const response = await request.get("/api/transactions/export");
  expect(response.status()).toBe(401);
});
