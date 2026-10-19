import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

import { type Page, devices, expect, test } from "@playwright/test";

/**
 * Release verification for a deployed environment (PHASE 12). One run
 * registers two throwaway accounts ("release-check-…@example.test"), uses
 * non-sensitive sample data, and deletes both at the end — also when a check
 * fails — so nothing stays behind. Expected figures are computed by hand in the
 * comments. Production allows 5 sign-ups per IP per hour: run it at most twice
 * an hour from one machine.
 */

const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Release ${randomBytes(9).toString("base64url")}`;

async function register(page: Page, label: string) {
  const email = `release-check-${label}-${stamp}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("Release check");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("combobox", { name: label }).click();
  const choice = page.getByRole("option", { name: option });
  await expect(async () => {
    if (await choice.isVisible()) await choice.click();
    await expect(page.getByRole("listbox")).toBeHidden({ timeout: 1_000 });
  }).toPass();
}

async function addAccount(page: Page, preset: string, opening: string) {
  await page.goto("/accounts/new");
  await page.getByRole("button", { name: preset, exact: true }).click();
  await page.getByLabel("Starting balance").fill(opening);
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]{36}$/);
  return page.url();
}

async function addEntry(
  page: Page,
  type: "income" | "expense",
  amount: string,
  category: string,
  account?: RegExp,
) {
  await page.goto(`/transactions/new?type=${type}`);
  await page.getByLabel("Amount").fill(amount);
  if (account) await choose(page, "Account", account);
  await choose(page, "Category", category);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
}

async function deleteOwnAccount(page: Page) {
  await page.goto("/settings#delete");
  await page.getByRole("button", { name: "Delete account…" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await dialog.getByLabel("Your password").fill(password);
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/notice=account-deleted/);
}

/** Run `body`, then always delete the test account — even when a check failed. */
async function withCleanup(page: Page, body: () => Promise<void>) {
  let passed = false;
  try {
    await body();
    passed = true;
  } finally {
    try {
      await deleteOwnAccount(page);
    } catch (error) {
      if (passed) throw error; // only report cleanup errors when the checks passed
    }
  }
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

test("platform: health, HTTPS and security headers", async ({ request, baseURL }, info) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const body = await health.json();
  expect(body).toMatchObject({ status: "ok", database: "ok" });
  info.annotations.push({ type: "version", description: String(body.version) });
  const page = await request.get("/sign-in");
  const headers = page.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  if (baseURL?.startsWith("https://")) {
    expect(headers["strict-transport-security"]).toContain("max-age=");
  }
});

test("protected routes and APIs refuse anonymous visitors", async ({ page, request }) => {
  for (const path of ["/dashboard", "/transactions", "/reports", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
  expect((await request.get("/api/me")).status()).toBe(401);
  expect((await request.get("/api/me/export")).status()).toBe(401);
  expect((await request.get("/api/transactions/export")).status()).toBe(401);
  // Disabled (503) or wrong secret (401) — never runs without the secret.
  expect([401, 503]).toContain((await request.get("/api/cron/recurring")).status());
  expect(
    (
      await request.get("/api/cron/recurring", { headers: { authorization: "Bearer wrong" } })
    ).status(),
  ).not.toBe(200);
});

test("core money flows, phone layout, reports, export and isolation", async ({ page, browser }) => {
  const email = await register(page, "desktop");
  await withCleanup(page, async () => {
    // Sign out and back in.
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // ABA 100.00, Wing 0, Cash 50,000 riel.
    const aba = await addAccount(page, "ABA Bank", "100");
    await addAccount(page, "Wing", "0");
    await addAccount(page, "Cash (riel)", "50,000");

    // +1,000.00 salary and −12.50 food on ABA; −20,000 riel transport on Cash.
    await addEntry(page, "income", "1000", "Salary", /ABA Bank/);
    await addEntry(page, "expense", "12.50", "Food and drinks", /ABA Bank/);
    await addEntry(page, "expense", "20000", "Transportation", /Cash/);

    // Transfer 100.00 ABA → Wing (not income or spending).
    await page.goto("/transactions/new?type=transfer");
    await page.getByLabel("Amount").fill("100");
    await choose(page, "From account", /ABA Bank/);
    await choose(page, "To account", /Wing/);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/transactions$/);

    // Balances: ABA 100 + 1,000 − 12.50 − 100 = 987.50; Wing 100.00; Cash 30,000.
    await page.goto("/accounts");
    const list = page.locator("main");
    await expect(list).toContainText("$987.50");
    await expect(list).toContainText("$100.00");
    await expect(list).toContainText("៛30,000");
    // USD total 1,087.50 (transfers move money, they don't create it).
    await expect(list).toContainText("$1,087.50");

    // Budget: food 10.00 this month, spent 12.50 → over budget.
    await page.goto("/budgets/new");
    await choose(page, "Expense category", "Food and drinks");
    await page.getByLabel("Monthly limit").fill("10");
    await page.getByRole("button", { name: "Add budget" }).click();
    await expect(page).toHaveURL(/\/budgets\?month=/);
    await expect(page.getByRole("listitem", { name: /Food and drinks/ })).toContainText(
      "Over budget",
    );

    // Dashboard: income 1,000.00, expenses 12.50 (USD); transfers excluded.
    await page.goto("/dashboard");
    await expect(page.locator("main")).toContainText("$1,000.00");
    await expect(page.locator("main")).toContainText("$12.50");

    // Reports + CSV export of this month's records.
    await page.goto("/reports");
    await expect(page.locator("main")).toContainText("$987.50"); // net USD = 1,000 − 12.50
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Export CSV" }).click(),
    ]);
    const csv = readFileSync((await file.path())!, "utf8");
    expect(csv).toContain(",Income,1000.00,USD,ABA Bank,");
    expect(csv).toContain(",Expense,12.50,USD,ABA Bank,");
    expect(csv).toContain(",Expense,20000,KHR,Cash (riel),");
    expect(csv).toContain(",Transfer,100.00,USD,ABA Bank,Wing,");

    // Isolation: another user can't open this user's account page.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await register(otherPage, "other");
    await withCleanup(otherPage, async () => {
      await otherPage.goto(aba.replace(/^https?:\/\/[^/]+/, ""));
      await expect(
        otherPage.getByRole("heading", { name: "We couldn't find that page" }),
      ).toBeVisible();
    });
    await other.close();

    // Phone layout with the same account and data (a phone-sized, touch browser).
    const phone = await browser.newContext({ ...devices["Pixel 7"] });
    const phonePage = await phone.newPage();
    await phonePage.goto("/sign-in");
    await phonePage.getByLabel("Email").fill(email);
    await phonePage.getByLabel("Password", { exact: true }).fill(password);
    await phonePage.getByRole("button", { name: "Sign in" }).click();
    await expect(phonePage).toHaveURL(/\/dashboard$/);
    for (const path of [
      "/dashboard",
      "/transactions",
      "/accounts",
      "/budgets",
      "/reports",
      "/settings",
    ]) {
      await phonePage.goto(path);
      await expect(phonePage.getByRole("heading", { level: 1 })).toBeVisible();
      await noSidewaysScroll(phonePage);
    }
    await expect(phonePage.getByRole("navigation", { name: "Main" }).last()).toBeVisible();
    await phone.close();
  }); // the test account and every record in it are deleted here
});

test("scheduled job endpoint runs with the secret", async ({ request }) => {
  const secret = process.env.RELEASE_CRON_SECRET;
  test.skip(
    !secret,
    "RELEASE_CRON_SECRET not given; the job's own run history is in Vercel → Settings → Cron Jobs",
  );
  const response = await request.get("/api/cron/recurring", {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    rules: expect.any(Number),
    posted: expect.any(Number),
    failed: 0,
  });
});
