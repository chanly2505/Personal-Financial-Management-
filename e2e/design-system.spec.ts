import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { level: 1, name: "Design system" })).toBeVisible();
});

test("form field wires labels, descriptions and errors for assistive tech", async ({ page }) => {
  const amount = page.getByLabel("Amount");
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(amount).toHaveAccessibleDescription("Enter an amount greater than zero.");
  await expect(page.getByLabel("Account name")).toHaveAccessibleDescription(
    "Shown in lists and reports.",
  );
  await expect(page.getByLabel("Currency", { exact: true }).first()).toBeAttached();
});

test("confirm dialog is keyboard accessible and shows a pending state", async ({ page }) => {
  await page.getByRole("button", { name: "Delete…" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete 'Sample entry'?" });
  await expect(dialog).toBeVisible();
  // Focus starts on the safe choice.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Delete…" }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Deleted", { exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();
});

test("select, dropdown menu and tabs work with the keyboard", async ({ page }) => {
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Cambodian Riel (KHR)" }).click();
  await expect(page.getByRole("combobox")).toHaveText(/Cambodian Riel/);

  await page.getByRole("button", { name: "More actions" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await page.keyboard.press("Escape");

  const tab = page.getByRole("tab", { name: "Move money" });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Transfer form goes here.")).toBeVisible();
});

test("toasts announce outcomes", async ({ page }) => {
  await page.getByRole("button", { name: "Success toast" }).click();
  await expect(page.getByText("Expense added")).toBeVisible();
});
