import { expect } from "@playwright/test";

import { test } from "./fixtures";

test("shows the default income and expense categories", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/categories");
  for (const name of ["Food and drinks", "Transportation", "Subscriptions", "Other expenses"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Income" }).click();
  for (const name of ["Salary", "Business income", "Freelance income", "Investment income"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
});

test("adds, edits, archives, restores and deletes a custom category", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/categories");

  await page.getByRole("button", { name: "Add category" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add category" });
  await dialog.getByLabel("Name").fill("Coffee");
  await dialog.getByLabel("Amber").check();
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Category added")).toBeVisible();
  await expect(page.getByText("Coffee", { exact: true })).toBeVisible();

  // Duplicate (case-insensitive) is rejected with a field error.
  await page.getByRole("button", { name: "Add category" }).first().click();
  await dialog.getByLabel("Name").fill("coffee");
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(
    dialog.getByText("You already have an expense category with this name."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Actions for Coffee" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit category" });
  await edit.getByLabel("Name").fill("Coffee and tea");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Coffee and tea", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Coffee and tea" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("heading", { name: "Archived (1)" })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Coffee and tea" }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: "Archived (1)" })).toBeHidden();

  await page.getByRole("button", { name: "Actions for Coffee and tea" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Coffee and tea", { exact: true })).toHaveCount(0);
});

test("new categories default to the open tab's type", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/categories");
  await page.getByRole("tab", { name: "Income" }).click();
  await page.getByRole("button", { name: "Add category" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add category" });
  await expect(dialog.getByLabel("Money in (income)")).toBeChecked();
  await dialog.getByLabel("Name").fill("Tips");
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("tabpanel").getByText("Tips", { exact: true })).toBeVisible();
});
