import { readFileSync } from "node:fs";

import { expect, newUser, register, test } from "./fixtures";
import { seedEverything } from "./seed";

/**
 * Settings end to end: preferences persist and change how every page shows
 * amounts and dates (never the data), notifications by keyboard, the data
 * download, the deletion dialog, and keyboard basics of the shell.
 */

test.beforeEach(async ({ page }) => {
  const user = await register(page, newUser("settings"));
  await seedEverything(user.email);
});

async function choose(
  page: import("@playwright/test").Page,
  label: string,
  option: string | RegExp,
) {
  await page.getByRole("combobox", { name: label }).click();
  // Retry until the list has closed: a click during the opening animation can be
  // lost, and the next key press must go to the form, not the list.
  const choice = page.getByRole("option", { name: option });
  await expect(async () => {
    if (await choice.isVisible()) await choice.click();
    await expect(page.getByRole("listbox")).toBeHidden({ timeout: 1_000 });
  }).toPass();
}

test("display preferences persist and apply across the app", async ({ page }) => {
  await page.goto("/settings");
  await choose(page, "Date format", /^\d{4}-\d{2}-\d{2}$/);
  await choose(page, "Number format", "1.234.567,89");
  await choose(page, "Show currencies as", /Codes/);
  const preview = page.getByText("Preview").locator("..");
  await expect(preview).toContainText(/USD\s1\.234,56/);
  await expect(preview).toContainText(/KHR\s4\.100\.000/);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved")).toBeVisible();

  // Amounts and dates elsewhere follow the preference; the stored values do not change.
  await page.goto("/transactions");
  await expect(page.getByText(/USD\s12,50/).first()).toBeVisible();
  await expect(page.getByText(/KHR\s20\.000/).first()).toBeVisible();
  await page.goto("/reports");
  await expect(
    page.getByText(/This month: \d{4}-\d{2}-01/).filter({ visible: true }),
  ).toBeVisible();

  // After a reload the saved choice is still selected.
  await page.goto("/settings");
  await expect(page.getByRole("combobox", { name: "Show currencies as" })).toHaveText(/Codes/);
  await expect(page.getByRole("combobox", { name: "Number format" })).toHaveText("1.234.567,89");

  // The CSV export keeps its fixed, documented format.
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  expect(readFileSync((await file.path())!, "utf8")).toContain(",Expense,12.50,USD,");
});

test("budget warnings are chosen with the keyboard and saved", async ({ page }) => {
  await page.goto("/settings");
  const first = page.getByRole("radio", { name: /Early warning and limit/ });
  await expect(first).toBeChecked();
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: /Only at the limit/ })).toBeChecked();
  await page.getByRole("button", { name: "Save notifications" }).click();
  await expect(page.getByText("Notification settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: /Only at the limit/ })).toBeChecked();
});

test("all data downloads as JSON without secrets", async ({ page }) => {
  await page.goto("/settings");
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download all data" }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^personal-finance-data-\d{4}-\d{2}-\d{2}\.json$/);
  const text = readFileSync((await file.path())!, "utf8");
  const data = JSON.parse(text);
  expect(data.accounts).toHaveLength(3);
  expect(data.transactions).toHaveLength(3);
  expect(text).not.toMatch(/password|sessionVersion/i);
});

test("the delete dialog lists what will go, offers a download and returns focus", async ({
  page,
}) => {
  await page.goto("/settings");
  const trigger = page.getByRole("button", { name: "Delete account…" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(dialog.getByRole("listitem").filter({ hasText: "Accounts" })).toContainText("3");
  await expect(dialog.getByRole("listitem").filter({ hasText: "Transactions" })).toContainText("3");
  await expect(dialog.getByRole("link", { name: "Download all your data" })).toBeVisible();
  // Nothing happens without the password and the typed confirmation.
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("keyboard users can skip the navigation", async ({ page }) => {
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content|\/dashboard/);
  await page.keyboard.press("Tab");
  // Focus is now inside the page content, not back in the sidebar.
  const inMain = await page.evaluate(() => !!document.activeElement?.closest("main"));
  expect(inMain).toBe(true);
});
