import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createAccount, getAccountsOverview } from "@/features/accounts/server/service";
import { createBudget, getBudgetMonth } from "@/features/budgets/server/service";
import { dashboardFiltersSchema } from "@/features/dashboard/schemas";
import { getDashboard } from "@/features/dashboard/server/service";
import { reportFiltersSchema } from "@/features/reports/schemas";
import { getReport } from "@/features/reports/server/service";
import { prepareLedgerExport } from "@/features/transactions/server/export";
import { ledgerFiltersSchema } from "@/features/transactions/schemas";
import {
  createEntry,
  createTransfer,
  deleteEntry,
  deleteTransfer,
  getLedgerPage,
  getRecord,
  reverseTransfer,
  updateEntry,
} from "@/features/transactions/server/service";
import { todayInTimeZone } from "@/lib/dates";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Independent reconciliation (QA audit, Phase 11).
 *
 * A seeded pseudo-random sequence of real operations — income, expenses,
 * transfers, edits that move records between accounts and currencies, deletes,
 * reversals — goes through the application's services. In parallel the test
 * keeps its own minimal model (plain bigint arithmetic, no application code)
 * and every derived figure the app shows is compared with it: balances,
 * ledger totals, dashboard, reports, budgets and the CSV export.
 */

type Cur = "USD" | "KHR";
type Kind = "INCOME" | "EXPENSE" | "TRANSFER";
interface ModelRecord {
  kind: Kind;
  account: string;
  to?: string;
  category?: string;
  minor: bigint;
  date: string;
  reversedBy?: string;
  reverses?: string;
}

const TZ = "Asia/Phnom_Penh";
const OPS = 160;

/** Deterministic PRNG (mulberry32) so a failure is reproducible. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minor units → the text a user would type, computed without application code. */
function typed(minor: bigint, cur: Cur): string {
  if (cur === "KHR") return minor.toString();
  const s = minor.toString().padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

const state = {
  user: { id: "", timezone: TZ, baseCurrency: "USD" as Cur },
  today: "",
  accounts: {} as Record<string, { cur: Cur; opening: bigint }>,
  categories: {} as Record<string, "INCOME" | "EXPENSE">,
  food: "",
  records: new Map<string, ModelRecord>(),
  ops: { entries: 0, transfers: 0, edits: 0, deletes: 0, reversals: 0 },
};

function signedFor(r: ModelRecord, account: string): bigint {
  if (r.kind === "INCOME") return r.account === account ? r.minor : 0n;
  if (r.kind === "EXPENSE") return r.account === account ? -r.minor : 0n;
  return (r.to === account ? r.minor : 0n) - (r.account === account ? r.minor : 0n);
}

function expectedBalance(account: string, asOf: string | null) {
  let total = state.accounts[account]!.opening;
  for (const r of state.records.values())
    if (!asOf || r.date <= asOf) total += signedFor(r, account);
  return total;
}

function expectedTotals(filter: (r: ModelRecord) => boolean) {
  const out: Record<Cur, { count: number; income: bigint; expense: bigint }> = {
    USD: { count: 0, income: 0n, expense: 0n },
    KHR: { count: 0, income: 0n, expense: 0n },
  };
  for (const r of state.records.values()) {
    if (!filter(r)) continue;
    const t = out[state.accounts[r.account]!.cur];
    t.count += 1;
    if (r.kind === "INCOME") t.income += r.minor;
    if (r.kind === "EXPENSE") t.expense += r.minor;
  }
  return out;
}

beforeAll(async () => {
  await resetDatabase();
  const registered = await registerTestUser();
  state.user.id = registered.id;
  state.today = todayInTimeZone(TZ);
  const user = state.user;
  for (const [name, cur, opening] of [
    ["ABA", "USD", "100.00"],
    ["Wing", "USD", "0"],
    ["Cash", "KHR", "50000"],
    ["Acleda", "KHR", "0"],
  ] as const) {
    const { id } = await createAccount(user, {
      name,
      type: "BANK",
      currency: cur,
      openingBalance: opening,
    });
    state.accounts[id] = {
      cur,
      opening: cur === "USD" ? BigInt(Math.round(Number(opening) * 100)) : BigInt(opening),
    };
  }
  for (const c of await prisma.category.findMany({ where: { userId: user.id } })) {
    state.categories[c.id] = c.type;
    if (c.name === "Food and drinks") state.food = c.id;
  }
  await createBudget(user, {
    categoryId: state.food,
    currency: "USD",
    month: "2026-02",
    amount: "150",
    alertThresholdPercent: 80,
  });

  const rand = rng(20261017);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  const accountIds = Object.keys(state.accounts);
  const byType = (type: "INCOME" | "EXPENSE") =>
    Object.keys(state.categories).filter((id) => state.categories[id] === type);
  // Dates across month ends, a leap-free February, and a few future-dated records.
  const dates = [
    "2026-01-31",
    "2026-02-01",
    "2026-02-14",
    "2026-02-28",
    "2026-03-01",
    "2026-03-31",
  ];
  const future = ["2027-01-15"];
  const randomDate = () => (rand() < 0.08 ? pick(future) : pick(dates));
  const randomMinor = (cur: Cur) =>
    cur === "USD"
      ? BigInt(1 + Math.floor(rand() * 20_000))
      : BigInt(100 * (1 + Math.floor(rand() * 500)));

  for (let i = 0; i < OPS; i++) {
    const roll = rand();
    const entries = [...state.records.entries()].filter(([, r]) => r.kind !== "TRANSFER");
    const transfers = [...state.records.entries()].filter(([, r]) => r.kind === "TRANSFER");
    if (roll < 0.45 || entries.length < 5) {
      const type = rand() < 0.35 ? "INCOME" : "EXPENSE";
      const account = pick(accountIds);
      const cur = state.accounts[account]!.cur;
      const category = type === "EXPENSE" && rand() < 0.4 ? state.food : pick(byType(type));
      const minor = randomMinor(cur);
      const date = randomDate();
      const { id } = await createEntry(user, {
        type,
        accountId: account,
        categoryId: category,
        amount: typed(minor, cur),
        occurredOn: date,
        clientRequestId: randomUUID(),
      });
      state.records.set(id, { kind: type, account, category, minor, date });
      state.ops.entries++;
    } else if (roll < 0.65) {
      const cur: Cur = rand() < 0.5 ? "USD" : "KHR";
      const same = accountIds.filter((a) => state.accounts[a]!.cur === cur);
      const from = pick(same);
      const to = same.find((a) => a !== from)!;
      const minor = randomMinor(cur);
      const date = randomDate();
      const { id } = await createTransfer(user, {
        fromAccountId: from,
        toAccountId: to,
        amount: typed(minor, cur),
        occurredOn: date,
        clientRequestId: randomUUID(),
      });
      state.records.set(id, { kind: "TRANSFER", account: from, to, minor, date });
      state.ops.transfers++;
    } else if (roll < 0.8) {
      // Edit: new amount, date and possibly a different account (and currency).
      const [id, r] = pick(entries);
      const account = pick(accountIds);
      const cur = state.accounts[account]!.cur;
      const minor = randomMinor(cur);
      const date = randomDate();
      const detail = await getRecord(user, id);
      await updateEntry(user, {
        id,
        expectedUpdatedAt: detail.updatedAt.toISOString(),
        type: r.kind as "INCOME" | "EXPENSE",
        accountId: account,
        categoryId: r.category!,
        amount: typed(minor, cur),
        occurredOn: date,
      });
      state.records.set(id, { ...r, account, minor, date });
      state.ops.edits++;
    } else if (roll < 0.9) {
      const [id] = pick(entries);
      await deleteEntry(user, id);
      state.records.delete(id);
      state.ops.deletes++;
    } else {
      const reversible = transfers.filter(([, r]) => !r.reversedBy && !r.reverses);
      if (reversible.length === 0) continue;
      const [id, r] = pick(reversible);
      if (rand() < 0.5) {
        const { id: rev } = await reverseTransfer(user, { id, clientRequestId: randomUUID() });
        state.records.set(id, { ...r, reversedBy: rev });
        state.records.set(rev, {
          kind: "TRANSFER",
          account: r.to!,
          to: r.account,
          minor: r.minor,
          // Dated today, or on the original's date when that is later (QA-04).
          date: r.date > state.today ? r.date : state.today,
          reverses: id,
        });
        state.ops.reversals++;
      } else {
        await deleteTransfer(user, id);
        state.records.delete(id);
        state.ops.deletes++;
      }
    }
  }
}, 180_000);

describe("independent reconciliation", () => {
  it("exercised every kind of operation", () => {
    expect(state.ops.entries).toBeGreaterThan(20);
    expect(state.ops.transfers).toBeGreaterThan(10);
    expect(state.ops.edits).toBeGreaterThan(5);
    expect(state.ops.deletes).toBeGreaterThan(5);
    expect(state.ops.reversals).toBeGreaterThan(0);
  });

  it("account balances (current and projected) equal opening + records", async () => {
    const overview = await getAccountsOverview(state.user);
    for (const a of [...overview.active, ...overview.archived]) {
      expect(a.balanceMinor, `${a.name} current`).toBe(expectedBalance(a.id, state.today));
      expect(a.projectedBalanceMinor, `${a.name} projected`).toBe(expectedBalance(a.id, null));
    }
    for (const total of overview.totals) {
      const ids = Object.keys(state.accounts).filter(
        (id) => state.accounts[id]!.cur === total.currency,
      );
      expect(total.balanceMinor).toBe(
        ids.reduce((s, id) => s + expectedBalance(id, state.today), 0n),
      );
    }
  });

  it("transfers never change the combined balance of a currency, nor income or spending", async () => {
    for (const cur of ["USD", "KHR"] as const) {
      const ids = Object.keys(state.accounts).filter((id) => state.accounts[id]!.cur === cur);
      const opening = ids.reduce((s, id) => s + state.accounts[id]!.opening, 0n);
      const t = expectedTotals(() => true)[cur];
      expect(ids.reduce((s, id) => s + expectedBalance(id, null), 0n)).toBe(
        opening + t.income - t.expense,
      );
    }
    const page = await getLedgerPage(state.user, ledgerFiltersSchema.parse({ kind: "TRANSFER" }));
    expect(page.summary.every((s) => s.incomeMinor === 0n && s.expenseMinor === 0n)).toBe(true);
  });

  it("ledger totals per currency match, overall and for a month", async () => {
    for (const [filters, keep] of [
      [{}, () => true],
      [
        { from: "2026-02-01", to: "2026-02-28" },
        (r: ModelRecord) => r.date >= "2026-02-01" && r.date <= "2026-02-28",
      ],
    ] as const) {
      const page = await getLedgerPage(state.user, ledgerFiltersSchema.parse(filters));
      const expected = expectedTotals(keep);
      for (const s of page.summary) {
        expect([s.incomeMinor, s.expenseMinor]).toEqual([
          expected[s.currency].income,
          expected[s.currency].expense,
        ]);
      }
      expect(page.total).toBe(expected.USD.count + expected.KHR.count);
    }
  });

  it("dashboard and reports agree with the model for Q1 2026", async () => {
    const keep = (r: ModelRecord) => r.date >= "2026-01-01" && r.date <= "2026-03-31";
    const expected = expectedTotals(keep);
    const dash = await getDashboard(
      state.user,
      dashboardFiltersSchema.parse({ period: "custom", from: "2026-01-01", to: "2026-03-31" }),
    );
    for (const t of dash.totals) {
      expect([t.incomeMinor, t.expenseMinor]).toEqual([
        expected[t.currency].income,
        expected[t.currency].expense,
      ]);
    }
    const report = await getReport(
      state.user,
      reportFiltersSchema.parse({
        report: "cash-flow",
        period: "custom",
        from: "2026-01-01",
        to: "2026-03-31",
        granularity: "month",
      }),
    );
    for (const c of report.currencies) {
      expect(c.totals.count).toBe(expected[c.currency].count);
      expect(c.series.reduce((s, p) => s + p.incomeMinor, 0n)).toBe(expected[c.currency].income);
      expect(c.series.reduce((s, p) => s + p.expenseMinor, 0n)).toBe(expected[c.currency].expense);
      // February's bucket equals the records dated in February.
      const feb = expectedTotals((r) => r.date >= "2026-02-01" && r.date <= "2026-02-28")[
        c.currency
      ];
      const bucket = c.series.find((p) => p.start === "2026-02-01")!;
      expect([bucket.incomeMinor, bucket.expenseMinor]).toEqual([feb.income, feb.expense]);
    }
  });

  it("account history runs from opening to closing balance for every account", async () => {
    for (const id of Object.keys(state.accounts)) {
      const { accountHistory: h } = await getReport(
        state.user,
        reportFiltersSchema.parse({
          report: "account",
          accountId: id,
          period: "custom",
          from: "2026-02-01",
          to: "2026-03-31",
        }),
      );
      expect(h!.openingMinor).toBe(expectedBalance(id, "2026-01-31"));
      expect(h!.closingMinor).toBe(expectedBalance(id, "2026-03-31"));
      expect(h!.openingMinor + h!.inMinor - h!.outMinor).toBe(h!.closingMinor);
      expect(h!.rows.at(-1)?.balanceMinor ?? h!.openingMinor).toBe(h!.closingMinor);
    }
  });

  it("budget spent equals February food expenses in USD", async () => {
    const month = await getBudgetMonth(state.user, "2026-02");
    let spent = 0n;
    for (const r of state.records.values()) {
      if (
        r.kind === "EXPENSE" &&
        r.category === state.food &&
        state.accounts[r.account]!.cur === "USD" &&
        r.date >= "2026-02-01" &&
        r.date <= "2026-02-28"
      ) {
        spent += r.minor;
      }
    }
    expect(month.active[0]!.spentMinor).toBe(spent);
    expect(month.active[0]!.remainingMinor).toBe(15000n - spent);
  });

  it("the CSV export lists exactly the model's records with exact amounts", async () => {
    const { stream } = await prepareLedgerExport(
      state.user,
      ledgerFiltersSchema.parse({ sort: "date_asc" }),
    );
    const lines = (await new Response(stream).text())
      .replace(/^﻿/, "")
      .trim()
      .split("\r\n")
      .slice(1);
    expect(lines).toHaveLength(state.records.size);
    const ids = new Set(lines.map((l) => l.split(",").at(-1)));
    expect(ids).toEqual(new Set(state.records.keys()));
    const sums: Record<string, bigint> = {};
    for (const line of lines) {
      const [, type, amount, cur] = line.split(",");
      const minor = BigInt(amount!.replace(".", ""));
      sums[`${type}|${cur}`] = (sums[`${type}|${cur}`] ?? 0n) + minor;
    }
    const expected = expectedTotals(() => true);
    for (const cur of ["USD", "KHR"] as const) {
      expect(sums[`Income|${cur}`] ?? 0n).toBe(expected[cur].income);
      expect(sums[`Expense|${cur}`] ?? 0n).toBe(expected[cur].expense);
    }
  });
});
