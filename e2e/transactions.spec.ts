import "dotenv/config";
import { type Page } from "@playwright/test";
import { Client } from "pg";

import { expect, newUser, register, test } from "./fixtures";

/** Transactions through the real UI: entry, balances, transfers, reversal, filters, paging. */

async function addAccount(page: Page, preset: string, opening: string) {
  await page.goto("/accounts/new");
  await page.getByRole("button", { name: preset, exact: true }).click();
  await page.getByLabel("Opening balance").fill(opening);
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() ?? "";
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("combobox", { name: label }).click();
  // Retry until the list has closed: a click during the opening animation can be
  // lost, and the next key press must go to the form, not the list.
  const choice = page.getByRole("option", { name: option });
  await expect(async () => {
    if (await choice.isVisible()) await choice.click();
    await expect(page.getByRole("listbox")).toBeHidden({ timeout: 1_000 });
  }).toPass();
}

async function balanceOn(page: Page, accountId: string) {
  await page.goto(`/accounts/${accountId}`);
  return page.getByText("Current balance").locator("..");
}

test("guides a new user to add an account before recording", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Add an account first" })).toBeVisible();
  await page.goto("/transactions/new");
  await expect(page.getByRole("heading", { name: "Add an account first" })).toBeVisible();
});

test("records an expense quickly and updates the balance", async ({ page, user }) => {
  expect(user).toBeTruthy();
  const bank = await addAccount(page, "ABA Bank", "100");

  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Record your first transaction" })).toBeVisible();
  await page.getByRole("link", { name: "Add transaction" }).first().click();
  await expect(page).toHaveURL(/\/transactions\/new$/);

  // Amount has focus: type it straight away.
  await expect(page.getByLabel("Amount")).toBeFocused();
  await page.keyboard.type("12.50");
  await choose(page, "Category", "Food and drinks");
  await page.getByLabel("Paid to (optional)").fill("Lucky Supermarket");
  await page.getByLabel("Amount").press("Enter");

  await expect(page).toHaveURL(/\/transactions$/);
  const list = page.getByRole("list", { name: "Transactions" });
  await expect(list.getByText("Lucky Supermarket")).toBeVisible();
  await expect(list.getByText("-$12.50")).toBeVisible();

  const card = await balanceOn(page, bank);
  await expect(card.getByText("$87.50")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Transactions" }).getByText("Lucky Supermarket"),
  ).toBeVisible();
});

test("save and add another keeps the account, category and date", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await addAccount(page, "Cash (riel)", "100,000");
  await page.goto("/transactions/new");
  await page.getByLabel("Amount").fill("5,000");
  await choose(page, "Category", "Transportation");
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText("Saved expense. Add the next one.")).toBeVisible();
  await expect(page.getByLabel("Amount")).toHaveValue("");
  await expect(page.getByLabel("Amount")).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveText("Transportation");
  await page.getByLabel("Amount").fill("2,500");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByText("1–2 of 2")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Totals for these transactions" })
      .getByText("-៛7,500")
      .first(),
  ).toBeVisible();
});

test("validates amounts, categories and dates", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await addAccount(page, "Cash (riel)", "0");
  await page.goto("/transactions/new");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Enter an amount.")).toBeVisible();
  await expect(page.getByText("Choose a category.")).toBeVisible();

  await page.getByLabel("Amount").fill("0");
  await choose(page, "Category", "Shopping");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Amount must be greater than zero.")).toBeVisible();

  await page.getByLabel("Amount").fill("10.5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("KHR amounts must be whole numbers.")).toBeVisible();

  await page.getByLabel("Amount").fill("-10");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Amount cannot be negative.")).toBeVisible();

  await page.getByLabel("Amount").fill("1000");
  await page.getByLabel("Date").fill("1999-12-31");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Choose a date in the year 2000 or later.")).toBeVisible();
  await expect(page).toHaveURL(/\/transactions\/new$/);
});

test("records income, edits it, then deletes it with confirmation", async ({ page, user }) => {
  expect(user).toBeTruthy();
  const bank = await addAccount(page, "ACLEDA Bank", "0");
  await page.goto("/transactions/new?type=income");
  await page.getByLabel("Amount").fill("1,500");
  await choose(page, "Category", "Salary");
  await page.getByLabel("From (optional)").fill("Employer");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);

  await page.getByRole("link", { name: /Employer/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Employer");
  await expect(page.getByText("+$1,500.00")).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Amount")).toHaveValue("1500.00");
  await page.getByLabel("Amount").fill("1,600");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);
  await expect(page.getByText("+$1,600.00")).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText('Delete "Employer – $1,600.00"?')).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole("heading", { name: "Record your first transaction" })).toBeVisible();

  const card = await balanceOn(page, bank);
  await expect(card.getByText("$0.00")).toBeVisible();
});

test("transfers between same-currency accounts and reverses a transfer", async ({ page, user }) => {
  expect(user).toBeTruthy();
  const bank = await addAccount(page, "ABA Bank", "100");
  const wing = await addAccount(page, "Wing", "0");
  await addAccount(page, "Cash (riel)", "0");

  await page.goto("/transactions/new?type=transfer");
  await page.getByLabel("Amount").fill("40");
  await choose(page, "From account", /ABA Bank/);
  await page.getByRole("combobox", { name: "To account" }).click();
  // The riel account is not offered for a USD transfer.
  await expect(page.getByRole("option", { name: /Cash \(riel\)/ })).toHaveCount(0);
  await page.getByRole("option", { name: /Wing/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);

  // A transfer is never income or expense.
  await expect(page.getByText("Totals for all records")).toBeVisible();
  await expect((await balanceOn(page, bank)).getByText("$60.00")).toBeVisible();
  await expect((await balanceOn(page, wing)).getByText("$40.00")).toBeVisible();
  await expect(page.getByRole("list", { name: "Transactions" }).getByText("+$40.00")).toBeVisible();

  await page.goto("/transactions");
  await page.getByRole("link", { name: /Transfer to Wing/ }).click();
  await page.getByRole("button", { name: "Reverse" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reverse transfer" }).click();
  await expect(page.getByText("Reversal", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Original transfer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);

  await expect((await balanceOn(page, bank)).getByText("$100.00")).toBeVisible();
  await expect((await balanceOn(page, wing)).getByText("$0.00")).toBeVisible();
});

test("filters, searches and pages through many records", async ({ page }) => {
  const user = await register(page, newUser("ledger"));
  const bank = await addAccount(page, "ABA Bank", "0");

  // Insert 30 records directly so paging has something to page through.
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string; category_id: string }>(
      `SELECT u.id, c.id AS category_id FROM users u
       JOIN categories c ON c.user_id = u.id AND c.name = 'Food and drinks'
       WHERE u.email = $1`,
      [user.email],
    );
    const owner = rows[0];
    if (!owner) throw new Error("user not found");
    for (let i = 1; i <= 30; i += 1) {
      await client.query(
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount_minor, occurred_on, payee, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'EXPENSE', $4, CURRENT_DATE - $5::int, $6, now())`,
        [owner.id, bank, owner.category_id, i * 100, i, i === 7 ? "Brown Coffee" : `Shop ${i}`],
      );
    }
  } finally {
    await client.end();
  }

  await page.goto("/transactions");
  await expect(page.getByText("1–25 of 30")).toBeVisible();
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("26–30 of 30")).toBeVisible();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();

  await page.getByRole("searchbox", { name: /Search/ }).fill("coffee");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/q=coffee/);
  await expect(page.getByText("1–1 of 1")).toBeVisible();
  await expect(page.getByText("Brown Coffee")).toBeVisible();

  await page.getByRole("searchbox", { name: /Search/ }).fill("nothing like this");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No matching transactions" })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).first().click();
  await expect(page.getByText("1–25 of 30")).toBeVisible();

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabel("Minimum amount").fill("28");
  await choose(page, "Sort by", "Largest amount");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("1–3 of 3")).toBeVisible();
  const first = page.getByRole("list", { name: "Transactions" }).getByRole("link").first();
  await expect(first).toContainText("-$30.00");
});

test("another user's record is not found", async ({ page, browser }) => {
  await register(page);
  await addAccount(page, "ABA Bank", "10");
  await page.goto("/transactions/new");
  await page.getByLabel("Amount").fill("1");
  await choose(page, "Category", "Shopping");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await page.getByRole("list", { name: "Transactions" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);
  const url = page.url();

  const context = await browser.newContext();
  const other = await context.newPage();
  await register(other);
  await other.goto(url);
  await expect(other.getByRole("heading", { name: /not found|couldn't find/i })).toBeVisible();
  await other.goto(`${url}/edit`);
  await expect(other.getByRole("heading", { name: /not found|couldn't find/i })).toBeVisible();
  await context.close();
});

test("a dropped connection while saving shows a message and keeps what was typed (UX-1)", async ({
  page,
  context,
  user,
}) => {
  expect(user).toBeTruthy();
  const bank = await addAccount(page, "ABA Bank", "100");
  await page.goto("/transactions/new");
  await page.getByLabel("Amount").fill("7.25");
  await choose(page, "Category", "Food and drinks");
  await page.getByLabel("Paid to (optional)").fill("Offline Cafe");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("We couldn't reach the server");
  await expect(page.getByLabel("Amount")).toHaveValue("7.25");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeEnabled();

  // Back online, the same form saves exactly once.
  await context.setOffline(false);
  await save.click();
  await expect(page).toHaveURL(/\/transactions$/);
  const card = await balanceOn(page, bank);
  await expect(card.getByText("$92.75")).toBeVisible();
  await page.goto("/transactions?q=Offline");
  await expect(
    page.getByRole("list", { name: "Transactions" }).getByText("Offline Cafe"),
  ).toHaveCount(1);
});
