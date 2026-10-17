import { performance } from "node:perf_hooks";

import { beforeAll, describe, expect, it } from "vitest";

import { createAccount, getAccountsOverview } from "@/features/accounts/server/service";
import {
  createBudget,
  getBudgetMonth,
  getCurrentMonthSummary,
} from "@/features/budgets/server/service";
import { dashboardFiltersSchema } from "@/features/dashboard/schemas";
import { getDashboard } from "@/features/dashboard/server/service";
import { createGoal, getGoalsSummary } from "@/features/goals/server/service";
import { reportFiltersSchema } from "@/features/reports/schemas";
import { getReport } from "@/features/reports/server/service";
import { prepareLedgerExport } from "@/features/transactions/server/export";
import { ledgerFiltersSchema } from "@/features/transactions/schemas";
import { getLedgerPage } from "@/features/transactions/server/service";
import { todayInTimeZone } from "@/lib/dates";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Performance benchmark (PRD §7: dashboard server time < 500 ms p95 for a user
 * with 10,000 records). Run with `npm run test:perf`; not part of `npm run check`.
 *
 * Seeds the test database with one user holding 10,000 income/expense records
 * and 1,500 transfers over three years, plus 20,000 records belonging to other
 * users (so indexes must pick out one user's rows), then times the data loading
 * of each page — the same service calls the pages make — and prints p50/p95.
 * Times exclude React rendering and network; they are measured on the local
 * PostgreSQL, so production numbers add the network round trips to Neon.
 */

const TZ = "Asia/Phnom_Penh";
const RECORDS = 10_000;
const TRANSFERS = 1_500;
const OTHER_USERS = 4;
const OTHER_RECORDS = 5_000;
const RUNS = 40;
const WARMUP = 5;

type User = { id: string; timezone: string; baseCurrency: "USD" };

/** Insert `count` income/expense records spread over the last three years. */
async function seedRecords(user: User, count: number) {
  const accounts = await prisma.financialAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  const categories = await prisma.category.findMany({ where: { userId: user.id } });
  const income = categories.filter((c) => c.type === "INCOME").map((c) => c.id);
  const expense = categories.filter((c) => c.type === "EXPENSE").map((c) => c.id);
  const ids = accounts.map((a) => a.id);
  const khr = accounts.map((a) => a.currency === "KHR");
  // Every 8th record is income; amounts are deterministic pseudo-random.
  await prisma.$executeRaw`
    INSERT INTO transactions
      (id, user_id, account_id, category_id, type, amount_minor, occurred_on, payee, note, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      ${user.id}::uuid,
      (${ids}::uuid[])[1 + g % ${ids.length}],
      CASE WHEN g % 8 = 0
        THEN (${income}::uuid[])[1 + g % ${income.length}]
        ELSE (${expense}::uuid[])[1 + g % ${expense.length}] END,
      (CASE WHEN g % 8 = 0 THEN 'INCOME' ELSE 'EXPENSE' END)::"TransactionType",
      CASE WHEN (${khr}::boolean[])[1 + g % ${ids.length}]
        THEN 1000 + (g * 7919) % 200000
        ELSE 100 + (g * 7919) % 20000 END
        * CASE WHEN g % 8 = 0 THEN 20 ELSE 1 END,
      (CURRENT_DATE - (g % 1095))::date,
      CASE WHEN g % 3 = 0 THEN 'Sample payee ' || (g % 50) END,
      CASE WHEN g % 5 = 0 THEN 'Sample note ' || g END,
      now(), now()
    FROM generate_series(1, ${count}) AS g`;
  return { accounts };
}

async function seedTransfers(user: User, from: string, to: string, count: number) {
  await prisma.$executeRaw`
    INSERT INTO transfers
      (id, user_id, from_account_id, to_account_id, from_amount_minor, to_amount_minor, occurred_on, created_at, updated_at)
    SELECT gen_random_uuid(), ${user.id}::uuid,
      CASE WHEN g % 2 = 0 THEN ${from}::uuid ELSE ${to}::uuid END,
      CASE WHEN g % 2 = 0 THEN ${to}::uuid ELSE ${from}::uuid END,
      500 + g % 5000, 500 + g % 5000,
      (CURRENT_DATE - (g % 1095))::date, now(), now()
    FROM generate_series(1, ${count}) AS g`;
}

async function newUser(): Promise<User> {
  const { id } = await registerTestUser();
  const user: User = { id, timezone: TZ, baseCurrency: "USD" };
  for (const [name, currency, openingBalance] of [
    ["ABA", "USD", "500"],
    ["Wing", "USD", "0"],
    ["Cash", "KHR", "200000"],
  ] as const) {
    await createAccount(user, { name, type: "BANK", currency, openingBalance });
  }
  return user;
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

async function measure(name: string, run: () => Promise<unknown>) {
  for (let i = 0; i < WARMUP; i++) await run();
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const result = { name, p50: percentile(times, 50), p95: percentile(times, 95) };
  console.log(
    `${name.padEnd(36)} p50 ${result.p50.toFixed(1).padStart(7)} ms   p95 ${result.p95.toFixed(1).padStart(7)} ms`,
  );
  return result;
}

const state = { user: undefined as unknown as User };

beforeAll(async () => {
  await resetDatabase();
  const user = await newUser();
  state.user = user;
  const { accounts } = await seedRecords(user, RECORDS);
  await seedTransfers(user, accounts[0]!.id, accounts[1]!.id, TRANSFERS);
  const food = await prisma.category.findFirstOrThrow({
    where: { userId: user.id, name: "Food and drinks" },
  });
  const month = todayInTimeZone(TZ).slice(0, 7);
  await createBudget(user, {
    categoryId: food.id,
    currency: "USD",
    month,
    amount: "300",
    alertThresholdPercent: 80,
  });
  await createGoal(user, { name: "Emergency fund", currency: "USD", target: "5000" });
  for (let i = 0; i < OTHER_USERS; i++) {
    await seedRecords(await newUser(), OTHER_RECORDS);
  }
  await prisma.$executeRawUnsafe("ANALYZE");
}, 300_000);

describe("page data loading with 10,000 records", () => {
  it("has the seeded volume", async () => {
    const own = await prisma.transaction.count({ where: { userId: state.user.id } });
    const transfers = await prisma.transfer.count({ where: { userId: state.user.id } });
    const all = await prisma.transaction.count();
    console.log(`records: ${own} own, ${transfers} transfers, ${all} in total`);
    expect(own).toBe(RECORDS);
  });

  it("dashboard stays under 500 ms p95 (PRD §7)", async () => {
    const user = state.user;
    const filters = dashboardFiltersSchema.parse({});
    const yearFilters = dashboardFiltersSchema.parse({ period: "this_year" });
    // The dashboard page loads these three in parallel.
    const month = await measure("dashboard (this month)", () =>
      Promise.all([
        getDashboard(user, filters),
        getCurrentMonthSummary(user),
        getGoalsSummary(user),
      ]),
    );
    const year = await measure("dashboard (this year)", () =>
      Promise.all([
        getDashboard(user, yearFilters),
        getCurrentMonthSummary(user),
        getGoalsSummary(user),
      ]),
    );
    expect(month.p95).toBeLessThan(500);
    expect(year.p95).toBeLessThan(500);
  });

  it("other pages stay under 500 ms p95", async () => {
    const user = state.user;
    const results = [
      await measure("transactions (first page)", () =>
        Promise.all([
          getLedgerPage(user, ledgerFiltersSchema.parse({})),
          getAccountsOverview(user),
        ]),
      ),
      await measure("transactions (search 'payee 7')", () =>
        getLedgerPage(user, ledgerFiltersSchema.parse({ q: "payee 7" })),
      ),
      await measure("transactions (page 40)", () =>
        getLedgerPage(user, ledgerFiltersSchema.parse({ page: "40" })),
      ),
      await measure("accounts", () => getAccountsOverview(user)),
      await measure("budgets (this month)", () => getBudgetMonth(user)),
      await measure("reports: summary, last year", () =>
        getReport(user, reportFiltersSchema.parse({ period: "last_year" })),
      ),
      await measure("reports: cash flow, 3 years by day", () =>
        getReport(
          user,
          reportFiltersSchema.parse({
            report: "cash-flow",
            period: "custom",
            from: todayInTimeZone(TZ).replace(/^\d{4}/, (y) => String(Number(y) - 3)),
            to: todayInTimeZone(TZ),
            granularity: "day",
          }),
        ),
      ),
    ];
    for (const r of results) expect(r.p95, r.name).toBeLessThan(500);
  });

  it("CSV export of all 11,500 rows completes well within a request", async () => {
    const start = performance.now();
    const { stream, rowCount } = await prepareLedgerExport(
      state.user,
      ledgerFiltersSchema.parse({}),
    );
    const text = await new Response(stream).text();
    const ms = performance.now() - start;
    console.log(
      `CSV export: ${rowCount} rows, ${(text.length / 1024).toFixed(0)} KiB in ${ms.toFixed(0)} ms`,
    );
    expect(rowCount).toBe(RECORDS + TRANSFERS);
    expect(ms).toBeLessThan(5_000);
  });
});
