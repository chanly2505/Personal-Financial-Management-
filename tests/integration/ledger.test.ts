import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { createAccount, getAccountsOverview } from "@/features/accounts/server/service";
import { ledgerFiltersSchema } from "@/features/transactions/schemas";
import {
  amountBounds,
  createEntry,
  createTransfer,
  deleteEntry,
  getLedgerPage,
  reverseTransfer,
} from "@/features/transactions/server/service";
import { addDays, todayInTimeZone } from "@/lib/dates";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Ledger listing (filters, sorting, pagination, totals) and reconciliation:
 * account balances and ledger totals must agree with the records exactly.
 */

const TZ = "Asia/Phnom_Penh";
type U = { id: string; timezone: string };

const today = () => todayInTimeZone(TZ);
const day = (offset: number) => addDays(today(), offset);
const filters = (params: Record<string, string | undefined> = {}) =>
  ledgerFiltersSchema.parse(params);

async function newUser(): Promise<U> {
  const user = await registerTestUser();
  return { id: user.id, timezone: TZ };
}

async function categoryId(userId: string, name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { userId, name } })).id;
}

interface Fixture {
  user: U;
  bank: string;
  wallet: string;
  cash: string;
  food: string;
  salary: string;
}

/** A small, known ledger in two currencies. */
async function seedLedger(): Promise<Fixture> {
  const user = await newUser();
  const acct = async (name: string, currency: "USD" | "KHR", openingBalance: string) =>
    (await createAccount(user, { name, type: "BANK", currency, openingBalance })).id;
  const bank = await acct("ABA Bank", "USD", "1000");
  const wallet = await acct("Wing Wallet", "USD", "0");
  const cash = await acct("Riel cash", "KHR", "200,000");
  const food = await categoryId(user.id, "Food and drinks");
  const salary = await categoryId(user.id, "Salary");
  const entry = (
    type: "INCOME" | "EXPENSE",
    accountId: string,
    category: string,
    amount: string,
    offset: number,
    payee?: string,
    note?: string,
  ) =>
    createEntry(user, {
      type,
      accountId,
      categoryId: category,
      amount,
      occurredOn: day(offset),
      payee,
      note,
      clientRequestId: randomUUID(),
    });

  await entry("INCOME", bank, salary, "1,500", -20, "Employer", "October salary");
  await entry("EXPENSE", bank, food, "12.50", -5, "Lucky Supermarket");
  await entry("EXPENSE", bank, food, "4.25", -1, "Brown Coffee", "Latte 100%_off");
  await entry("EXPENSE", cash, food, "15,000", -2, "Market");
  await entry("EXPENSE", cash, food, "8,000", 3, "Upcoming dinner");
  await createTransfer(user, {
    fromAccountId: bank,
    toAccountId: wallet,
    amount: "200",
    occurredOn: day(-3),
    note: "Top up",
    clientRequestId: randomUUID(),
  });
  return { user, bank, wallet, cash, food, salary };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("filters", () => {
  it("lists everything newest first by default", async () => {
    const { user } = await seedLedger();
    const page = await getLedgerPage(user, filters());
    expect(page.total).toBe(6);
    expect(page.items.map((i) => i.occurredOn)).toEqual(
      [3, -1, -2, -3, -5, -20].map((offset) => day(offset)),
    );
  });

  it("filters by type", async () => {
    const { user } = await seedLedger();
    expect((await getLedgerPage(user, filters({ kind: "INCOME" }))).total).toBe(1);
    expect((await getLedgerPage(user, filters({ kind: "EXPENSE" }))).total).toBe(4);
    const transfers = await getLedgerPage(user, filters({ kind: "TRANSFER" }));
    expect(transfers.items).toHaveLength(1);
    expect(transfers.items[0]).toMatchObject({
      kind: "TRANSFER",
      account: { name: "ABA Bank" },
      toAccount: { name: "Wing Wallet" },
      category: null,
    });
  });

  it("filters by account, including transfers in either direction", async () => {
    const { user, wallet, cash } = await seedLedger();
    const walletPage = await getLedgerPage(user, filters({ accountId: wallet }));
    expect(walletPage.items.map((i) => i.kind)).toEqual(["TRANSFER"]);
    expect((await getLedgerPage(user, filters({ accountId: cash }))).total).toBe(2);
  });

  it("filters by category and date range (inclusive)", async () => {
    const { user, food } = await seedLedger();
    expect((await getLedgerPage(user, filters({ categoryId: food }))).total).toBe(4);
    const range = await getLedgerPage(user, filters({ from: day(-5), to: day(-1) }));
    expect(range.total).toBe(4);
    // Reversed bounds are swapped rather than returning nothing.
    expect((await getLedgerPage(user, filters({ from: day(-1), to: day(-5) }))).total).toBe(4);
  });

  it("searches payee, note, category and account names, case-insensitively and literally", async () => {
    const { user } = await seedLedger();
    expect((await getLedgerPage(user, filters({ q: "lucky" }))).total).toBe(1);
    expect((await getLedgerPage(user, filters({ q: "SALARY" }))).total).toBe(1);
    expect((await getLedgerPage(user, filters({ q: "wing" }))).total).toBe(1);
    expect((await getLedgerPage(user, filters({ q: "top up" }))).total).toBe(1);
    // LIKE wildcards are matched literally.
    expect((await getLedgerPage(user, filters({ q: "100%_off" }))).total).toBe(1);
    expect((await getLedgerPage(user, filters({ q: "%" }))).total).toBe(1);
    expect((await getLedgerPage(user, filters({ q: "_" }))).total).toBe(1);
  });

  it("filters by amount range in each record's own currency", async () => {
    const { user } = await seedLedger();
    // USD 10–300 → 12.50 and 200; KHR 10–300 riel → none.
    const page = await getLedgerPage(user, filters({ min: "10", max: "300" }));
    expect(page.items.map((i) => i.amountMinor).sort()).toEqual([1250n, 20000n].sort());
    // KHR 10,000+ riel matches the 15,000 expense; USD 10,000+ matches nothing.
    const riel = await getLedgerPage(user, filters({ min: "10000" }));
    expect(riel.items.map((i) => [i.currency, i.amountMinor])).toEqual([["KHR", 15000n]]);
  });

  it("rounds KHR amount bounds inward", () => {
    expect(amountBounds("12.5", "up")).toEqual({ USD: 1250n, KHR: 13n });
    expect(amountBounds("12.5", "down")).toEqual({ USD: 1250n, KHR: 12n });
    expect(amountBounds("12", "up")).toEqual({ USD: 1200n, KHR: 12n });
  });

  it("combines filters", async () => {
    const { user, bank, food } = await seedLedger();
    const page = await getLedgerPage(
      user,
      filters({ kind: "EXPENSE", accountId: bank, categoryId: food, min: "5" }),
    );
    expect(page.items.map((i) => i.payee)).toEqual(["Lucky Supermarket"]);
  });

  it("ignores invalid filter values instead of failing", () => {
    const parsed = filters({
      kind: "BOGUS",
      accountId: "not-a-uuid",
      from: "2026-02-30",
      min: "-5",
      sort: "sideways",
      page: "-3",
    });
    expect(parsed).toMatchObject({ sort: "date_desc", page: 1 });
    expect(parsed.kind).toBeUndefined();
    expect(parsed.accountId).toBeUndefined();
    expect(parsed.from).toBeUndefined();
    expect(parsed.min).toBeUndefined();
  });

  it("never shows another user's records", async () => {
    const { bank } = await seedLedger();
    const stranger = await newUser();
    expect((await getLedgerPage(stranger, filters())).total).toBe(0);
    expect((await getLedgerPage(stranger, filters({ accountId: bank }))).total).toBe(0);
  });
});

describe("sorting and pagination", () => {
  it("sorts by amount within each currency and by date both ways", async () => {
    const { user } = await seedLedger();
    const desc = await getLedgerPage(user, filters({ sort: "amount_desc" }));
    expect(desc.items.map((i) => `${i.currency}:${i.amountMinor}`)).toEqual([
      "USD:150000",
      "USD:20000",
      "USD:1250",
      "USD:425",
      "KHR:15000",
      "KHR:8000",
    ]);
    const asc = await getLedgerPage(user, filters({ sort: "date_asc" }));
    expect(asc.items[0]?.occurredOn).toBe(day(-20));
  });

  it("pages through results with a stable order and no duplicates", async () => {
    const user = await newUser();
    const bank = (
      await createAccount(user, {
        name: "Bank",
        type: "BANK",
        currency: "USD",
        openingBalance: "0",
      })
    ).id;
    const food = await categoryId(user.id, "Food and drinks");
    // 12 records on the same date: order must still be deterministic.
    for (let i = 1; i <= 12; i += 1) {
      await createEntry(user, {
        type: "EXPENSE",
        accountId: bank,
        categoryId: food,
        amount: String(i),
        occurredOn: today(),
        clientRequestId: randomUUID(),
      });
    }
    const pages = await Promise.all(
      [1, 2, 3].map((page) => getLedgerPage(user, filters({ page: String(page) }), 5)),
    );
    expect(pages.map((p) => p.items.length)).toEqual([5, 5, 2]);
    expect(pages[0]).toMatchObject({ total: 12, pageCount: 3, page: 1 });
    const ids = pages.flatMap((p) => p.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(12);
    // Newest first: the last created comes first.
    expect(pages[0]?.items[0]?.amountMinor).toBe(1200n);

    // A page past the end shows the last page.
    const beyond = await getLedgerPage(user, filters({ page: "99" }), 5);
    expect(beyond.page).toBe(3);
    expect(beyond.items).toHaveLength(2);
  });

  it("returns an empty first page when nothing matches", async () => {
    const user = await newUser();
    expect(await getLedgerPage(user, filters({ page: "4" }))).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      pageCount: 1,
      summary: [],
    });
  });
});

describe("reconciliation", () => {
  it("summarises income and expenses per currency, never counting transfers", async () => {
    const { user } = await seedLedger();
    const page = await getLedgerPage(user, filters());
    expect(page.summary).toEqual([
      { currency: "USD", incomeMinor: 150000n, expenseMinor: 1675n, netMinor: 148325n },
      { currency: "KHR", incomeMinor: 0n, expenseMinor: 23000n, netMinor: -23000n },
    ]);
  });

  it("totals match the listed rows for any filter", async () => {
    const { user, bank, food } = await seedLedger();
    for (const params of [
      {},
      { accountId: bank },
      { categoryId: food },
      { q: "a" },
      { to: day(0) },
    ]) {
      const page = await getLedgerPage(user, filters(params), 100);
      expect(page.items).toHaveLength(page.total);
      for (const currency of ["USD", "KHR"] as const) {
        const rows = page.items.filter((i) => i.currency === currency);
        const sum = (kind: string) =>
          rows.filter((i) => i.kind === kind).reduce((s, i) => s + i.amountMinor, 0n);
        const summary = page.summary.find((s) => s.currency === currency);
        expect(summary?.incomeMinor ?? 0n).toBe(sum("INCOME"));
        expect(summary?.expenseMinor ?? 0n).toBe(sum("EXPENSE"));
      }
    }
  });

  it("account balances = opening + income − expenses + transfers in − transfers out", async () => {
    const { user, bank, wallet, cash } = await seedLedger();
    const { id: transferId } = await prisma.transfer.findFirstOrThrow({ select: { id: true } });
    await reverseTransfer(user, { id: transferId, clientRequestId: randomUUID() });
    const lucky = await prisma.transaction.findFirstOrThrow({
      where: { payee: "Lucky Supermarket" },
    });
    await deleteEntry(user, lucky.id);

    const overview = await getAccountsOverview(user);
    const accounts = new Map(overview.active.map((a) => [a.id, a]));
    // Current balances (up to today) recomputed from the ledger itself.
    const ledger = await getLedgerPage(user, filters({ to: today() }), 100);
    for (const account of overview.active) {
      let expected = account.openingBalanceMinor;
      for (const item of ledger.items) {
        if (item.kind === "INCOME" && item.account.id === account.id) expected += item.amountMinor;
        if (item.kind === "EXPENSE" && item.account.id === account.id) expected -= item.amountMinor;
        if (item.kind === "TRANSFER" && item.toAccount?.id === account.id)
          expected += item.amountMinor;
        if (item.kind === "TRANSFER" && item.account.id === account.id)
          expected -= item.amountMinor;
      }
      expect(account.balanceMinor).toBe(expected);
    }
    expect(accounts.get(bank)?.balanceMinor).toBe(100000n + 150000n - 425n);
    expect(accounts.get(wallet)?.balanceMinor).toBe(0n);
    expect(accounts.get(cash)?.balanceMinor).toBe(200000n - 15000n);
    // The upcoming dinner counts only in the projection.
    expect(accounts.get(cash)?.projectedBalanceMinor).toBe(200000n - 15000n - 8000n);

    // Per-currency totals: sum of balances = openings + net income; transfers cancel out.
    const usdOpening = 100000n;
    const usdLedger = ledger.summary.find((s) => s.currency === "USD");
    const usdTotal = overview.totals.find((t) => t.currency === "USD");
    expect(usdTotal?.balanceMinor).toBe(usdOpening + (usdLedger?.netMinor ?? 0n));
    const khrLedger = ledger.summary.find((s) => s.currency === "KHR");
    const khrTotal = overview.totals.find((t) => t.currency === "KHR");
    expect(khrTotal?.balanceMinor).toBe(200000n + (khrLedger?.netMinor ?? 0n));
  });
});
