import { type APIRequestContext, type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/** Recurring rules through the real UI, with the scheduler triggered like a hosted cron. */

const CRON = "e2e-cron-secret-0123456789abcdefghijklmnop";
const TZ = "Asia/Phnom_Penh";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
function inDays(n: number): string {
  const [y, m, d] = today().split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function monthsAgo(n: number): string {
  const [y, m, d] = today().split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 - n, Math.min(d, 28))).toISOString().slice(0, 10);
}

async function addAccount(page: Page) {
  await page.goto("/accounts/new");
  await page.getByRole("button", { name: "ABA Bank", exact: true }).click();
  await page.getByLabel("Opening balance").fill("1000");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]{36}$/);
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function runScheduler(request: APIRequestContext) {
  const res = await request.post("/api/cron/recurring", {
    headers: { authorization: `Bearer ${CRON}` },
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as { posted: number; failed: number };
}

async function createRule(
  page: Page,
  opts: { name: string; amount: string; category: string; startOn?: string; catchUp?: boolean },
) {
  await page.goto("/recurring/new");
  await page.getByLabel("Name").fill(opts.name);
  await page.getByLabel("Amount").fill(opts.amount);
  await choose(page, "Category", opts.category);
  if (opts.startOn) await page.getByLabel("Start date").fill(opts.startOn);
  if (opts.catchUp) await page.getByRole("checkbox", { name: /Also record the/ }).check();
  await page.getByRole("button", { name: "Add recurring rule" }).click();
  await expect(page).toHaveURL(/\/recurring\/[0-9a-f-]{36}$/);
}

test("a rule is a schedule: nothing is posted until the scheduler runs", async ({
  page,
  user,
  request,
}) => {
  expect(user).toBeTruthy();
  await page.goto("/recurring");
  await expect(page.getByRole("heading", { name: "No recurring transactions yet" })).toBeVisible();
  await addAccount(page);

  await page.goto("/recurring/new");
  // Interact first so the form is hydrated before typing the date.
  await choose(page, "Category", "Utilities");
  await page.getByLabel("Start date").fill("2026-01-31");
  await expect(page.getByRole("region", { name: "Schedule preview" })).toContainText(
    "Every month on the 31st (the last day in shorter months)",
  );
  // Starts in the future, so no scheduler run (other tests run in parallel) can post it.
  await createRule(page, {
    name: "Phone bill",
    amount: "15",
    category: "Utilities",
    startOn: inDays(10),
  });
  await expect(page.getByText("Recurring rule", { exact: true })).toBeVisible();
  await expect(page.getByText("Nothing posted yet.")).toBeVisible();

  await page.goto("/recurring");
  const upcoming = page.getByRole("list", { name: "Upcoming scheduled transactions" });
  await expect(upcoming).toContainText("Phone bill");
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Record your first transaction" })).toBeVisible();

  // Running the scheduler does not post a future date.
  await runScheduler(request);
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Record your first transaction" })).toBeVisible();
});

test("past dates are posted only when chosen, exactly once, and link back to the rule", async ({
  page,
  user,
  request,
}) => {
  expect(user).toBeTruthy();
  await addAccount(page);
  const start = monthsAgo(2);
  await createRule(page, {
    name: "Rent",
    amount: "300",
    category: "Housing and rent",
    startOn: start,
    catchUp: true,
  });

  await runScheduler(request);
  await runScheduler(request); // a retry posts nothing new
  await page.reload();
  const history = page.getByRole("list", { name: "Execution history" });
  await expect(history.getByText(/Posted/).first()).toBeVisible();
  const postedCount = await history.getByRole("listitem").count();
  expect(postedCount).toBeGreaterThanOrEqual(2);
  expect(postedCount).toBeLessThanOrEqual(3);

  await page.goto("/transactions");
  await expect(page.getByText(`1–${postedCount} of ${postedCount}`)).toBeVisible();

  await page.goto(page.url().replace(/\/transactions.*/, "/recurring"));
  await page.getByRole("link", { name: "Rent" }).click();
  await history.getByRole("link", { name: "View transaction" }).first().click();
  await expect(page.getByText("Recurring: Rent")).toBeVisible();
});

test("pause, resume and delete; deleting keeps posted transactions", async ({
  page,
  user,
  request,
}) => {
  expect(user).toBeTruthy();
  await addAccount(page);
  await createRule(page, {
    name: "Gym",
    amount: "20",
    category: "Health",
    startOn: monthsAgo(1),
    catchUp: true,
  });
  await runScheduler(request);

  await page.getByRole("button", { name: "Actions for Gym" }).click();
  await page.getByRole("menuitem", { name: "Pause" }).click();
  await expect(page.getByText("Paused by you")).toBeVisible();
  await page.getByRole("button", { name: "Actions for Gym" }).click();
  await page.getByRole("menuitem", { name: "Resume" }).click();
  await expect(page.getByText("Paused by you")).toHaveCount(0);

  await page.getByRole("button", { name: "Actions for Gym" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/recurring$/);
  await expect(page.getByRole("heading", { name: "No recurring transactions yet" })).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByRole("list", { name: "Transactions" })).toContainText("Health");
});

test("the scheduler endpoint rejects requests without the secret", async ({ request }) => {
  expect((await request.post("/api/cron/recurring")).status()).toBe(401);
  expect(
    (
      await request.get("/api/cron/recurring", { headers: { authorization: "Bearer nope" } })
    ).status(),
  ).toBe(401);
});
