import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/** Savings goals through the real UI: earmarks, progress, withdrawal limit, archive. */

async function addAccount(page: Page, opening = "500") {
  await page.goto("/accounts/new");
  await page.getByRole("button", { name: "ABA Bank", exact: true }).click();
  await page.getByLabel("Opening balance").fill(opening);
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]{36}$/);
}

async function addGoal(page: Page, name: string, target: string, linkAccount = false) {
  await page.goto("/goals/new");
  await page.getByLabel("Goal name").fill(name);
  await page.getByLabel("Target amount").fill(target);
  if (linkAccount) {
    await page.getByRole("combobox", { name: "Kept in (optional)" }).click();
    await page.getByRole("option", { name: /ABA Bank/ }).click();
  }
  await page.getByRole("button", { name: "Add goal" }).click();
  await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}$/);
}

async function contribute(
  page: Page,
  amount: string,
  kind: "Set aside" | "Take back" = "Set aside",
) {
  const form = page.getByRole("form", { name: "Update savings" });
  if (kind === "Take back") await form.getByText("Take back", { exact: true }).click();
  await form.getByLabel("Amount").fill(amount);
  await form.getByRole("button", { name: kind }).click();
}

test("set money aside, see progress, and balances stay the same", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await page.goto("/goals");
  await expect(page.getByRole("heading", { name: "Start a savings goal" })).toBeVisible();
  await addAccount(page);
  await addGoal(page, "Emergency fund", "1000", true);

  await contribute(page, "250");
  const card = page.getByRole("article", { name: "Emergency fund" });
  await expect(card.getByText("25% saved")).toBeVisible();
  await expect(card.getByText("$750.00 to go")).toBeVisible();
  await expect(card.getByRole("meter", { name: "Saved toward goal" })).toHaveAttribute(
    "aria-valuetext",
    "25% saved, $250.00 of $1,000.00",
  );
  await expect(page.getByRole("list", { name: "Savings history" })).toContainText("+$250.00");

  // Earmarks never change the account balance.
  await page.goto("/accounts");
  await expect(page.getByRole("region", { name: "Totals by currency" })).toContainText("$500.00");
});

test("cannot take back more than was saved; achieved state; warning when earmarks exceed the balance", async ({
  page,
  user,
}) => {
  expect(user).toBeTruthy();
  await addAccount(page, "100");
  await addGoal(page, "Phone", "150", true);
  await contribute(page, "50");
  await contribute(page, "60", "Take back");
  await expect(page.getByText("You can take back at most $50.00.")).toBeVisible();

  await page
    .getByRole("form", { name: "Update savings" })
    .getByText("Set aside", { exact: true })
    .click();
  await contribute(page, "100");
  const card = page.getByRole("article", { name: "Phone" });
  await expect(card.getByText("Achieved")).toBeVisible();
  await expect(card.getByText(/earmark \$150\.00, but it holds \$100\.00/)).toBeVisible();
});

test("edit, archive, restore and delete a goal", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await addGoal(page, "Trip", "300");
  await page.getByRole("button", { name: "Actions for Trip" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Target amount").fill("400");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("article", { name: "Trip" })).toContainText("of $400.00");

  await page.getByRole("button", { name: "Actions for Trip" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("This goal is archived.")).toBeVisible();
  await expect(page.getByRole("form", { name: "Update savings" })).toHaveCount(0);

  await page.getByRole("button", { name: "Actions for Trip" }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await expect(page.getByRole("form", { name: "Update savings" })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Trip" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/goals$/);
  await expect(page.getByRole("heading", { name: "Start a savings goal" })).toBeVisible();
});

test("the dashboard shows goal progress", async ({ page, user }) => {
  expect(user).toBeTruthy();
  await addAccount(page);
  await addGoal(page, "School fees", "200");
  await contribute(page, "50");
  await expect(page.getByRole("list", { name: "Savings history" })).toContainText("+$50.00");
  await page.goto("/dashboard");
  await expect(page.getByRole("article", { name: "School fees" })).toContainText("25% saved");
});
