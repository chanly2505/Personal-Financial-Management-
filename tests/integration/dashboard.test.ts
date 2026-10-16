import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { archiveAccount, createAccount } from "@/features/accounts/server/service";
import { dashboardFiltersSchema } from "@/features/dashboard/schemas";
import { getDashboard } from "@/features/dashboard/server/service";
import { ledgerFiltersSchema } from "@/features/transactions/schemas";
import { createEntry, createTransfer, getLedgerPage } from "@/features/transactions/server/service";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Dashboard figures against a fixed, hand-calculated ledger. Every expected
 * number below is worked out in the comments, independently of the code.
 */

const TZ = "Asia/Phnom_Penh";
type U = { id: string; timezone: string; baseCurrency: "USD" | "KHR" };

const march = (extra: Record<string, string> = {}) =>
  dashboardFiltersSchema.parse({
    period: "custom",
    from: "2026-03-01",
    to: "2026-03-31",
    ...extra,
  });

async function newUser(): Promise<U> {
  const user = await registerTestUser();
  return { id: user.id, timezone: TZ, baseCurrency: "USD" };
}

async function categoryId(userId: string, name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { userId, name } })).id;
}

interface Fixture {
  user: U;
  bank: string;
  wallet: string;
  cash: string;
  old: string;
}

/**
 * USD  ABA (opening 0), Wing (opening 0), Old (opening 0, archived after use)
 * KHR  Cash (opening 100,000)
 *
 * February: +1,000.00 salary (ABA), −300.00 food (ABA)
 * March:    +2,000.00 salary 03-01 (ABA)      −500.00 rent 03-01 (ABA)
 *           −12.50 food 03-05 (ABA)           transfer ABA→Wing 100.00 03-10 (excluded)
 *           −20,000 KHR transport 03-12 (Cash)
 *           +50.00 other income 03-15 (Old)   −50.00 shopping 03-16 (Old)  → Old archived at 0
 *           −7.50 food 03-20 (Wing)
 * April:    −10.00 food 04-02 (ABA)
 */
async function seed(): Promise<Fixture> {
  const user = await newUser();
  const account = async (name: string, currency: "USD" | "KHR", openingBalance = "0") =>
    (await createAccount(user, { name, type: "BANK", currency, openingBalance })).id;
  const bank = await account("ABA", "USD");
  const wallet = await account("Wing", "USD");
  const old = await account("Old", "USD");
  const cash = await account("Cash", "KHR", "100,000");
  const ids = {
    salary: await categoryId(user.id, "Salary"),
    otherIncome: await categoryId(user.id, "Other income"),
    food: await categoryId(user.id, "Food and drinks"),
    rent: await categoryId(user.id, "Housing and rent"),
    transport: await categoryId(user.id, "Transportation"),
    shopping: await categoryId(user.id, "Shopping"),
  };
  const entry = (
    type: "INCOME" | "EXPENSE",
    accountId: string,
    category: string,
    amount: string,
    occurredOn: string,
  ) =>
    createEntry(user, {
      type,
      accountId,
      categoryId: category,
      amount,
      occurredOn,
      clientRequestId: randomUUID(),
    });

  await entry("INCOME", bank, ids.salary, "1000", "2026-02-15");
  await entry("EXPENSE", bank, ids.food, "300", "2026-02-20");
  await entry("INCOME", bank, ids.salary, "2000", "2026-03-01");
  await entry("EXPENSE", bank, ids.rent, "500", "2026-03-01");
  await entry("EXPENSE", bank, ids.food, "12.50", "2026-03-05");
  await createTransfer(user, {
    fromAccountId: bank,
    toAccountId: wallet,
    amount: "100",
    occurredOn: "2026-03-10",
    clientRequestId: randomUUID(),
  });
  await entry("EXPENSE", cash, ids.transport, "20,000", "2026-03-12");
  await entry("INCOME", old, ids.otherIncome, "50", "2026-03-15");
  await entry("EXPENSE", old, ids.shopping, "50", "2026-03-16");
  await entry("EXPENSE", wallet, ids.food, "7.50", "2026-03-20");
  await entry("EXPENSE", bank, ids.food, "10", "2026-04-02");
  await archiveAccount(user, old);
  return { user, bank, wallet, cash, old };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("period totals", () => {
  it("counts income and expenses only, per currency, including archived accounts", async () => {
    const { user } = await seed();
    const d = await getDashboard(user, march());
    // USD income 2,000 + 50 = 2,050.00; expenses 500 + 12.50 + 50 + 7.50 = 570.00;
    // net 1,480.00; savings rate 1,480 / 2,050 = 72.195…% → 72.2. Transfer excluded.
    // KHR: no income, 20,000 expenses → rate undefined (null), not a division error.
    expect(d.totals).toEqual([
      {
        currency: "USD",
        incomeMinor: 205000n,
        expenseMinor: 57000n,
        netMinor: 148000n,
        savingsRatePercent: 72.2,
      },
      {
        currency: "KHR",
        incomeMinor: 0n,
        expenseMinor: 20000n,
        netMinor: -20000n,
        savingsRatePercent: null,
      },
    ]);
  });

  it("matches the transactions ledger totals for the same range", async () => {
    const { user } = await seed();
    const d = await getDashboard(user, march());
    const ledger = await getLedgerPage(
      user,
      ledgerFiltersSchema.parse({ from: "2026-03-01", to: "2026-03-31" }),
    );
    expect(
      d.totals.map(({ currency, incomeMinor, expenseMinor, netMinor }) => ({
        currency,
        incomeMinor,
        expenseMinor,
        netMinor,
      })),
    ).toEqual(ledger.summary);
  });

  it("is empty (not zero-filled guesses) for a month without records", async () => {
    const { user } = await seed();
    const d = await getDashboard(
      user,
      dashboardFiltersSchema.parse({ period: "custom", from: "2025-06-01", to: "2025-06-30" }),
    );
    expect(d.totals).toEqual([]);
    expect(d.recent).toEqual([]);
    expect(d.charts.categories).toEqual([]);
    expect(d.charts.cashFlow).toHaveLength(30);
    expect(d.charts.cashFlow.every((p) => p.incomeMinor === 0n && p.expenseMinor === 0n)).toBe(
      true,
    );
  });

  it("gives a negative savings rate when spending exceeds income", async () => {
    const { user } = await seed();
    // Feb + Mar 1: income 1,000 + 2,000 = 3,000; expenses 300 + 500 = 800 → 73.3 %.
    // Feb 20 only: income 0 → null. Mar 1 only: 2,000 vs 500 → 75.0 %.
    const febToMar1 = await getDashboard(
      user,
      dashboardFiltersSchema.parse({ period: "custom", from: "2026-02-01", to: "2026-03-01" }),
    );
    expect(febToMar1.totals[0]?.savingsRatePercent).toBe(73.3);
    const old = await getDashboard(
      user,
      dashboardFiltersSchema.parse({ period: "custom", from: "2026-03-16", to: "2026-03-16" }),
    );
    // Only the 50.00 shopping expense: income 0 → null.
    expect(old.totals[0]).toMatchObject({ netMinor: -5000n, savingsRatePercent: null });
    const mixed = await getDashboard(
      user,
      dashboardFiltersSchema.parse({ period: "custom", from: "2026-03-15", to: "2026-03-20" }),
    );
    // income 50.00, expenses 50.00 + 7.50 = 57.50 → (50 − 57.5) / 50 = −15.0 %.
    expect(mixed.totals[0]?.savingsRatePercent).toBe(-15);
  });
});

describe("balances", () => {
  it("shows current balances of active accounts, separate from period figures", async () => {
    const { user, bank, wallet, cash, old } = await seed();
    const d = await getDashboard(user, march());
    // ABA: +1,000 −300 +2,000 −500 −12.50 −100 −10 = 2,077.50
    // Wing: +100 −7.50 = 92.50. Cash: 100,000 − 20,000 = 80,000. Old: archived (0), not listed.
    const byId = new Map(d.accounts.map((a) => [a.id, a.balanceMinor]));
    expect(byId.get(bank)).toBe(207750n);
    expect(byId.get(wallet)).toBe(9250n);
    expect(byId.get(cash)).toBe(80000n);
    expect(byId.has(old)).toBe(false);
    expect(d.balances).toEqual([
      { currency: "USD", balanceMinor: 217000n, accountCount: 2 },
      { currency: "KHR", balanceMinor: 80000n, accountCount: 1 },
    ]);
    // The same balance for any period: it is "today", not "this period".
    const empty = await getDashboard(
      user,
      dashboardFiltersSchema.parse({ period: "custom", from: "2025-06-01", to: "2025-06-30" }),
    );
    expect(empty.balances).toEqual(d.balances);
  });
});

describe("charts", () => {
  it("draws daily income vs expenses that add up to the period totals", async () => {
    const { user } = await seed();
    const d = await getDashboard(user, march());
    expect(d.period.bucket).toBe("day");
    expect(d.charts.cashFlow).toHaveLength(31);
    expect(d.charts.cashFlow[0]).toEqual({
      start: "2026-03-01",
      incomeMinor: 200000n,
      expenseMinor: 50000n,
    });
    const income = d.charts.cashFlow.reduce((s, p) => s + p.incomeMinor, 0n);
    const expense = d.charts.cashFlow.reduce((s, p) => s + p.expenseMinor, 0n);
    expect([income, expense]).toEqual([205000n, 57000n]);
  });

  it("uses weekly buckets (Mondays) for longer ranges without losing anything", async () => {
    const { user } = await seed();
    const d = await getDashboard(
      user,
      dashboardFiltersSchema.parse({ period: "custom", from: "2026-02-01", to: "2026-04-30" }),
    );
    expect(d.period.bucket).toBe("week");
    // 2026-02-01 is a Sunday → first bucket starts Monday 2026-01-26.
    expect(d.charts.cashFlow[0]?.start).toBe("2026-01-26");
    for (const point of d.charts.cashFlow) {
      expect(new Date(`${point.start}T00:00:00Z`).getUTCDay()).toBe(1);
    }
    // USD Feb–Apr: income 1,000 + 2,050 = 3,050; expenses 300 + 570 + 10 = 880.
    const income = d.charts.cashFlow.reduce((s, p) => s + p.incomeMinor, 0n);
    const expense = d.charts.cashFlow.reduce((s, p) => s + p.expenseMinor, 0n);
    expect([income, expense]).toEqual([305000n, 88000n]);
    expect(d.totals[0]).toMatchObject({ incomeMinor: 305000n, expenseMinor: 88000n });
  });

  it("breaks spending down by category with shares, in the chart currency", async () => {
    const { user } = await seed();
    const d = await getDashboard(user, march());
    // Rent 500.00 (87.7 %), Shopping 50.00 (8.8 %), Food 12.50 + 7.50 = 20.00 (3.5 %).
    expect(d.charts.categories.map((c) => [c.name, c.amountMinor, c.sharePercent])).toEqual([
      ["Housing and rent", 50000n, 87.7],
      ["Shopping", 5000n, 8.8],
      ["Food and drinks", 2000n, 3.5],
    ]);
    const khr = await getDashboard(user, march({ currency: "KHR" }));
    expect(khr.chartCurrency).toBe("KHR");
    expect(khr.charts.categories.map((c) => [c.name, c.amountMinor, c.sharePercent])).toEqual([
      ["Transportation", 20000n, 100],
    ]);
  });

  it("shows six months of spending up to the period's end, empty months included", async () => {
    const { user } = await seed();
    const d = await getDashboard(user, march());
    expect(d.trendRange).toMatchObject({ from: "2025-10-01", to: "2026-03-31" });
    expect(d.charts.trend.map((p) => [p.start, p.expenseMinor])).toEqual([
      ["2025-10-01", 0n],
      ["2025-11-01", 0n],
      ["2025-12-01", 0n],
      ["2026-01-01", 0n],
      ["2026-02-01", 30000n],
      ["2026-03-01", 57000n],
    ]);
  });

  it("lists the most recent records in the period, transfers included, newest first", async () => {
    const { user } = await seed();
    const d = await getDashboard(user, march());
    expect(d.recent.map((r) => r.occurredOn)).toEqual([
      "2026-03-20",
      "2026-03-16",
      "2026-03-15",
      "2026-03-12",
      "2026-03-10",
      "2026-03-05",
      "2026-03-01",
      "2026-03-01",
    ]);
    expect(d.recent.find((r) => r.kind === "TRANSFER")?.amountMinor).toBe(10000n);
  });

  it("falls back to an available currency and lists currencies in a fixed order", async () => {
    const { user } = await seed();
    const d = await getDashboard({ ...user, baseCurrency: "KHR" }, march());
    expect(d.currencies).toEqual(["USD", "KHR"]);
    expect(d.chartCurrency).toBe("KHR");
    const bogus = await getDashboard(user, dashboardFiltersSchema.parse({ currency: "EUR" }));
    expect(bogus.chartCurrency).toBe("USD");
  });
});

describe("isolation and empty users", () => {
  it("shows nothing from other users", async () => {
    await seed();
    const stranger = await newUser();
    const d = await getDashboard(stranger, march());
    expect(d).toMatchObject({
      totals: [],
      recent: [],
      balances: [],
      accounts: [],
      hasAccounts: false,
    });
    expect(d.charts.categories).toEqual([]);
  });
});
