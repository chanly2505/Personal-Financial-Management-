import { type Page, expect, test as base } from "@playwright/test";

import { formAlert, newUser, register, test } from "./fixtures";

async function addAccount(
  page: Page,
  opts: {
    preset?: string;
    name?: string;
    currency?: "US Dollar (USD)" | "Cambodian Riel (KHR)";
    opening?: string;
  },
) {
  await page.goto("/accounts/new");
  if (opts.preset) await page.getByRole("button", { name: opts.preset, exact: true }).click();
  if (opts.name) await page.getByLabel("Account name").fill(opts.name);
  if (opts.currency) {
    await page.getByRole("combobox", { name: "Currency" }).click();
    await page.getByRole("option", { name: opts.currency }).click();
  }
  if (opts.opening !== undefined) await page.getByLabel("Opening balance").fill(opts.opening);
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]{36}$/);
}

test("empty state invites the first account", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "Add your first account" })).toBeVisible();
  await page.getByRole("link", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/accounts\/new$/);
});

test("creates accounts from presets with exact balances and separate currency totals", async ({
  page,
  user,
}) => {
  expect(user).toBeTruthy();
  await addAccount(page, { preset: "ABA Bank", opening: "1,250.50" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ABA Bank");
  await expect(page.getByText("$1,250.50").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "No records yet" })).toBeVisible();

  await addAccount(page, { preset: "Cash (riel)", opening: "400,000" });
  await addAccount(page, { name: "My ACLEDA", preset: undefined, opening: "49.50" });

  await page.goto("/accounts");
  const totals = page.getByRole("region", { name: "Totals by currency" });
  await expect(totals.getByText("$1,300.00")).toBeVisible();
  await expect(totals.getByText("៛400,000")).toBeVisible();
  await expect(page.getByText("Totals are kept separate for each currency")).toBeVisible();
  await expect(page.getByRole("link", { name: /ABA Bank/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cash \(riel\)/ })).toBeVisible();
});

test("validates names and amounts on the client and server", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/accounts/new");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("Enter a name.")).toBeVisible();

  await page.getByRole("button", { name: "Cash (riel)", exact: true }).click();
  await page.getByLabel("Opening balance").fill("100.50");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("KHR amounts must be whole numbers.")).toBeVisible();

  await addAccount(page, { preset: "Wing", opening: "5" });
  await page.goto("/accounts/new");
  await page.getByLabel("Account name").fill("wing");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("You already have an account with this name.")).toBeVisible();
});

test("edits an account but keeps its currency fixed", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await addAccount(page, { preset: "ACLEDA Bank", opening: "10" });
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("combobox", { name: "Currency" })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Type" })).toHaveText("Bank account");
  await page.getByLabel("Account name").fill("ACLEDA Savings");
  await page.getByLabel("Opening balance").fill("20.75");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ACLEDA Savings");
  await expect(page.getByText("$20.75").first()).toBeVisible();
});

test("archives only at zero balance, then restores", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await addAccount(page, { preset: "Cash", opening: "3" });
  const accountUrl = page.url();

  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText(/still holds \$3\.00/)).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Opening balance").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(accountUrl);

  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("This account is archived.")).toBeVisible();

  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "No active accounts" })).toBeVisible();
  await page.getByText("Archived accounts (1)").click();
  await page.getByRole("link", { name: /Cash/ }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("This account is archived.")).toBeHidden();
});

test("deletes an account that has no records", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await addAccount(page, { name: "Temporary" });
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("heading", { name: "Add your first account" })).toBeVisible();
});

base("another user's account is not found and absent from their list", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  await register(alice, newUser("alice"));
  await addAccount(alice, { name: "Alice private", opening: "777" });
  const url = alice.url();

  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await register(bob, newUser("bob"));
  // Identical to an unknown id: the not-found page, and none of Alice's data.
  // (Pages under the shared loading skeleton stream, so the status is 200 with
  // a noindex not-found body — see docs/SECURITY.md §4.)
  for (const target of [url, `${url}/edit`, "/accounts/0190e0a0-0000-7000-8000-000000000000"]) {
    await bob.goto(target);
    await expect(bob.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    await expect(bob.getByText("Alice private")).toHaveCount(0);
    await expect(bob.getByText("$777.00")).toHaveCount(0);
  }
  await bob.goto("/accounts");
  await expect(bob.getByText("Alice private")).toHaveCount(0);
  await expect(bob.getByText("$777.00")).toHaveCount(0);

  await aliceContext.close();
  await bobContext.close();
});

test("no form-level error is left on a successful save", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await addAccount(page, { name: "Clean" });
  await expect(formAlert(page)).toHaveCount(0);
});
