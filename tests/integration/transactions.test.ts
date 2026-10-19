import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  archiveAccount,
  createAccount,
  getAccount,
  restoreAccount,
} from "@/features/accounts/server/service";
import { archiveCategory } from "@/features/categories/server/service";
import {
  createEntry,
  createTransfer,
  deleteEntry,
  deleteTransfer,
  getRecord,
  reverseTransfer,
  updateEntry,
  updateTransfer,
} from "@/features/transactions/server/service";
import * as repo from "@/features/transactions/server/repository";
import { addDays, todayInTimeZone } from "@/lib/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/** The transaction engine against a real database: rules, integrity, concurrency. */

const TZ = "Asia/Phnom_Penh";
type U = { id: string; timezone: string };

async function newUser(): Promise<U> {
  const user = await registerTestUser();
  return { id: user.id, timezone: TZ };
}

const today = () => todayInTimeZone(TZ);
const day = (offset: number) => addDays(today(), offset);

async function category(userId: string, type: "INCOME" | "EXPENSE", name?: string) {
  return (
    await prisma.category.findFirstOrThrow({
      where: { userId, type, ...(name ? { name } : {}) },
      orderBy: { name: "asc" },
    })
  ).id;
}

async function usdAccount(user: U, name: string, openingBalance = "0") {
  return (await createAccount(user, { name, type: "BANK", currency: "USD", openingBalance })).id;
}
async function khrAccount(user: U, name: string, openingBalance = "0") {
  return (await createAccount(user, { name, type: "CASH", currency: "KHR", openingBalance })).id;
}

async function balance(user: U, accountId: string) {
  return (await getAccount(user, accountId)).balanceMinor;
}

async function expense(user: U, accountId: string, amount: string, extra: object = {}) {
  return createEntry(user, {
    type: "EXPENSE",
    accountId,
    categoryId: await category(user.id, "EXPENSE"),
    amount,
    occurredOn: today(),
    clientRequestId: randomUUID(),
    ...extra,
  });
}

async function income(user: U, accountId: string, amount: string) {
  return createEntry(user, {
    type: "INCOME",
    accountId,
    categoryId: await category(user.id, "INCOME"),
    amount,
    occurredOn: today(),
    clientRequestId: randomUUID(),
  });
}

function transfer(user: U, fromAccountId: string, toAccountId: string, amount: string) {
  return createTransfer(user, {
    fromAccountId,
    toAccountId,
    amount,
    occurredOn: today(),
    clientRequestId: randomUUID(),
  });
}

async function version(id: string) {
  const row =
    (await prisma.transaction.findUnique({ where: { id }, select: { updatedAt: true } })) ??
    (await prisma.transfer.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } }));
  return row.updatedAt.toISOString();
}

beforeEach(async () => {
  await resetDatabase();
});

describe("income and expenses", () => {
  it("creates entries in minor units and moves the balance", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const cash = await khrAccount(user, "Cash", "50,000");

    await income(user, bank, "1,250.50");
    await expense(user, bank, "20.25", { payee: "Lucky", note: "Groceries" });
    await expense(user, cash, "12,500");

    expect(await balance(user, bank)).toBe(10000n + 125050n - 2025n);
    expect(await balance(user, cash)).toBe(50000n - 12500n);
    const rows = await prisma.transaction.findMany({ where: { userId: user.id } });
    expect(rows.map((r) => r.amountMinor).sort()).toEqual([12500n, 125050n, 2025n].sort());
    expect(rows.find((r) => r.payee === "Lucky")?.note).toBe("Groceries");
  });

  it("derives the currency from the account (KHR rejects decimals, USD more than 2)", async () => {
    const user = await newUser();
    const cash = await khrAccount(user, "Cash");
    const bank = await usdAccount(user, "Bank");
    await expect(expense(user, cash, "10.50")).rejects.toThrow(/whole numbers/);
    await expect(expense(user, bank, "1.005")).rejects.toThrow(/at most 2 decimal/);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it.each([
    ["zero", "0", /greater than zero/],
    ["zero with decimals", "0.00", /greater than zero/],
    ["negative", "-5", /cannot be negative/],
    ["text", "ten", /valid number/],
    ["scientific notation", "1e3", /valid number/],
    ["over the maximum", "99999999999999999", /too large/],
  ] as const)("rejects a %s amount", async (_label, amount, message) => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank");
    const attempt = expense(user, bank, amount);
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toThrow(message);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("accepts dates from 2000-01-01 to one year ahead and rejects anything else", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank");
    await expect(expense(user, bank, "1", { occurredOn: "2000-01-01" })).resolves.toBeTruthy();
    await expect(expense(user, bank, "1", { occurredOn: day(366) })).resolves.toBeTruthy();
    await expect(expense(user, bank, "1", { occurredOn: "1999-12-31" })).rejects.toThrow(
      /2000 or later/,
    );
    await expect(expense(user, bank, "1", { occurredOn: day(367) })).rejects.toThrow(
      /one year ahead/,
    );
    expect(await prisma.transaction.count()).toBe(2);
  });

  it("rejects a category of the other type, an archived category and another user's", async () => {
    const user = await newUser();
    const other = await newUser();
    const bank = await usdAccount(user, "Bank");
    const incomeCategory = await category(user.id, "INCOME");
    await expect(expense(user, bank, "5", { categoryId: incomeCategory })).rejects.toThrow(
      /expense category/,
    );

    const groceries = await category(user.id, "EXPENSE");
    await archiveCategory(user, groceries);
    await expect(expense(user, bank, "5", { categoryId: groceries })).rejects.toThrow(/archived/);

    const foreign = await category(other.id, "EXPENSE");
    await expect(expense(user, bank, "5", { categoryId: foreign })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("rejects another user's account and archived accounts", async () => {
    const user = await newUser();
    const other = await newUser();
    const foreign = await usdAccount(other, "Theirs", "100");
    await expect(expense(user, foreign, "5")).rejects.toThrow(/couldn't find that account/);

    const old = await usdAccount(user, "Old");
    await archiveAccount(user, old);
    await expect(expense(user, old, "5")).rejects.toThrow(/archived/);
    expect(await prisma.transaction.count()).toBe(0);
  });
});

describe("duplicate submissions", () => {
  it("returns the first record when the same form is submitted twice", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const clientRequestId = randomUUID();
    const input = {
      type: "EXPENSE" as const,
      accountId: bank,
      categoryId: await category(user.id, "EXPENSE"),
      amount: "10",
      occurredOn: today(),
      clientRequestId,
    };
    const first = await createEntry(user, input);
    const second = await createEntry(user, input);
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(await balance(user, bank)).toBe(9000n);
  });

  it("creates exactly one record when identical submissions race", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const input = {
      type: "EXPENSE" as const,
      accountId: bank,
      categoryId: await category(user.id, "EXPENSE"),
      amount: "10",
      occurredOn: today(),
      clientRequestId: randomUUID(),
    };
    const results = await Promise.all(Array.from({ length: 6 }, () => createEntry(user, input)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await prisma.transaction.count()).toBe(1);
    expect(await balance(user, bank)).toBe(9000n);
  });

  it("creates exactly one transfer when identical transfer submissions race", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet");
    const input = {
      fromAccountId: bank,
      toAccountId: wallet,
      amount: "25",
      occurredOn: today(),
      clientRequestId: randomUUID(),
    };
    const results = await Promise.all(Array.from({ length: 5 }, () => createTransfer(user, input)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await prisma.transfer.count()).toBe(1);
    expect(await balance(user, bank)).toBe(7500n);
    expect(await balance(user, wallet)).toBe(2500n);
  });

  it("keeps request ids per user (two users may reuse the same id)", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const clientRequestId = randomUUID();
    const a = await usdAccount(alice, "A");
    const b = await usdAccount(bob, "B");
    const make = async (user: U, accountId: string) =>
      createEntry(user, {
        type: "EXPENSE",
        accountId,
        categoryId: await category(user.id, "EXPENSE"),
        amount: "1",
        occurredOn: today(),
        clientRequestId,
      });
    expect((await make(alice, a)).created).toBe(true);
    expect((await make(bob, b)).created).toBe(true);
  });
});

describe("editing and deleting entries", () => {
  it("edits amount, account, type and category, moving the balances", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet", "0");
    const { id } = await expense(user, bank, "10");

    await updateEntry(user, {
      id,
      expectedUpdatedAt: await version(id),
      type: "INCOME",
      accountId: wallet,
      categoryId: await category(user.id, "INCOME"),
      amount: "15.50",
      occurredOn: day(-3),
      payee: "Employer",
    });

    expect(await balance(user, bank)).toBe(10000n);
    expect(await balance(user, wallet)).toBe(1550n);
    const record = await getRecord(user, id);
    expect(record).toMatchObject({ kind: "INCOME", occurredOn: day(-3), payee: "Employer" });
  });

  it("rejects switching type while keeping a category of the old type", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const categoryId = await category(user.id, "EXPENSE");
    const { id } = await expense(user, bank, "10", { categoryId });
    await expect(
      updateEntry(user, {
        id,
        expectedUpdatedAt: await version(id),
        type: "INCOME",
        accountId: bank,
        categoryId,
        amount: "10",
        occurredOn: today(),
      }),
    ).rejects.toThrow(/income category/);
  });

  it("keeps an archived category that the record already has", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const categoryId = await category(user.id, "EXPENSE");
    const { id } = await expense(user, bank, "10", { categoryId });
    await archiveCategory(user, categoryId);
    await updateEntry(user, {
      id,
      expectedUpdatedAt: await version(id),
      type: "EXPENSE",
      accountId: bank,
      categoryId,
      amount: "12",
      occurredOn: today(),
    });
    expect(await balance(user, bank)).toBe(8800n);
  });

  it("rejects a stale edit (someone changed the record after it was opened)", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const { id } = await expense(user, bank, "10");
    const opened = await version(id);
    const edit = async (amount: string) =>
      updateEntry(user, {
        id,
        expectedUpdatedAt: opened,
        type: "EXPENSE",
        accountId: bank,
        categoryId: await category(user.id, "EXPENSE"),
        amount,
        occurredOn: today(),
      });
    await edit("20");
    await expect(edit("30")).rejects.toBeInstanceOf(ConflictError);
    expect(await balance(user, bank)).toBe(8000n);
  });

  it("lets exactly one of two concurrent edits of the same version win", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const { id } = await expense(user, bank, "10");
    const opened = await version(id);
    const categoryId = await category(user.id, "EXPENSE");
    const results = await Promise.allSettled(
      ["20", "30", "40"].map((amount) =>
        updateEntry(user, {
          id,
          expectedUpdatedAt: opened,
          type: "EXPENSE",
          accountId: bank,
          categoryId,
          amount,
          occurredOn: today(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(ConflictError);
  });

  it("deletes an entry and restores the balance", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const { id } = await expense(user, bank, "10");
    await deleteEntry(user, id);
    expect(await balance(user, bank)).toBe(10000n);
    await expect(getRecord(user, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteEntry(user, id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never edits or deletes another user's records", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const bank = await usdAccount(alice, "Bank", "100");
    const { id } = await expense(alice, bank, "10");
    const bobBank = await usdAccount(bob, "Bob bank");

    await expect(getRecord(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteEntry(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateEntry(bob, {
        id,
        expectedUpdatedAt: await version(id),
        type: "EXPENSE",
        accountId: bobBank,
        categoryId: await category(bob.id, "EXPENSE"),
        amount: "1",
        occurredOn: today(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await balance(alice, bank)).toBe(9000n);
  });

  it("freezes records of archived accounts", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "0");
    await income(user, bank, "10");
    const { id } = await expense(user, bank, "10");
    await archiveAccount(user, bank);
    await expect(deleteEntry(user, id)).rejects.toThrow(/archived/);
    await restoreAccount(user, bank);
    await deleteEntry(user, id);
  });
});

describe("transfers", () => {
  it("moves money between two accounts without counting as income or expense", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet", "5");
    await transfer(user, bank, wallet, "40.25");
    expect(await balance(user, bank)).toBe(10000n - 4025n);
    expect(await balance(user, wallet)).toBe(500n + 4025n);
    expect(await prisma.transaction.count()).toBe(0);
    const row = await prisma.transfer.findFirstOrThrow();
    expect(row.fromAmountMinor).toBe(4025n);
    expect(row.toAmountMinor).toBe(4025n);
  });

  it("requires two different accounts of the same currency", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const cash = await khrAccount(user, "Cash", "100000");
    await expect(transfer(user, bank, bank, "1")).rejects.toThrow(/two different accounts/);
    await expect(transfer(user, bank, cash, "1")).rejects.toThrow(/same currency/);
    expect(await prisma.transfer.count()).toBe(0);
  });

  it("rejects archived and foreign accounts", async () => {
    const user = await newUser();
    const other = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const old = await usdAccount(user, "Old");
    await archiveAccount(user, old);
    const theirs = await usdAccount(other, "Theirs");
    await expect(transfer(user, bank, old, "1")).rejects.toThrow(/archived/);
    await expect(transfer(user, bank, theirs, "1")).rejects.toThrow(/couldn't find that account/);
    await expect(transfer(user, theirs, bank, "1")).rejects.toThrow(/couldn't find that account/);
    expect(await prisma.transfer.count()).toBe(0);
  });

  it("rolls back completely when the write fails part-way", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet");
    await transfer(user, wallet, bank, "0.01");
    const before = [await balance(user, bank), await balance(user, wallet)];
    // A failure inside the database transaction (the second write breaks a CHECK)
    // must undo the first write too.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.transfer.create({
          data: {
            userId: user.id,
            fromAccountId: bank,
            toAccountId: wallet,
            fromAmountMinor: 100n,
            toAmountMinor: 100n,
            occurredOn: new Date(),
          },
        });
        await tx.transfer.create({
          data: {
            userId: user.id,
            fromAccountId: bank,
            toAccountId: wallet,
            fromAmountMinor: 100n,
            toAmountMinor: 200n,
            occurredOn: new Date(),
          },
        });
      }),
    ).rejects.toThrow(/transfers_same_amount_chk/);
    expect([await balance(user, bank), await balance(user, wallet)]).toEqual(before);
    expect(await prisma.transfer.count()).toBe(1);
  });

  it("edits a transfer (amount, accounts, date) and keeps both legs equal", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet");
    const savings = await usdAccount(user, "Savings");
    const { id } = await transfer(user, bank, wallet, "10");
    await updateTransfer(user, {
      id,
      expectedUpdatedAt: await version(id),
      fromAccountId: bank,
      toAccountId: savings,
      amount: "30",
      occurredOn: day(-1),
      note: "Monthly saving",
    });
    expect(await balance(user, bank)).toBe(7000n);
    expect(await balance(user, wallet)).toBe(0n);
    expect(await balance(user, savings)).toBe(3000n);
    const row = await prisma.transfer.findUniqueOrThrow({ where: { id } });
    expect([row.fromAmountMinor, row.toAmountMinor]).toEqual([3000n, 3000n]);
  });

  it("deletes a transfer and restores both balances", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet");
    const { id } = await transfer(user, bank, wallet, "10");
    await deleteTransfer(user, id);
    expect(await balance(user, bank)).toBe(10000n);
    expect(await balance(user, wallet)).toBe(0n);
  });
});

describe("reversing transfers", () => {
  it("creates an opposite, linked transfer dated today that cancels the original", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet");
    const { id } = await createTransfer(user, {
      fromAccountId: bank,
      toAccountId: wallet,
      amount: "25",
      occurredOn: day(-10),
      clientRequestId: randomUUID(),
    });
    const reversal = await reverseTransfer(user, { id, clientRequestId: randomUUID() });

    expect(await balance(user, bank)).toBe(10000n);
    expect(await balance(user, wallet)).toBe(0n);
    const record = await getRecord(user, reversal.id);
    expect(record).toMatchObject({
      kind: "TRANSFER",
      occurredOn: today(),
      reversesTransferId: id,
      fromAccount: { id: wallet },
      toAccount: { id: bank },
      amountMinor: 2500n,
    });
    expect(await getRecord(user, id)).toMatchObject({ reversedByTransferId: reversal.id });
  });

  it("reverses a transfer only once, even when reversals race", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet");
    const { id } = await transfer(user, bank, wallet, "25");
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => reverseTransfer(user, { id, clientRequestId: randomUUID() })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.transfer.count({ where: { reversesTransferId: id } })).toBe(1);
    expect(await balance(user, bank)).toBe(10000n);
    await expect(reverseTransfer(user, { id, clientRequestId: randomUUID() })).rejects.toThrow(
      /already been reversed/,
    );
  });

  it("is idempotent for a repeated reversal request", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet");
    const { id } = await transfer(user, bank, wallet, "25");
    const clientRequestId = randomUUID();
    const first = await reverseTransfer(user, { id, clientRequestId });
    const second = await reverseTransfer(user, { id, clientRequestId });
    expect(second).toEqual({ id: first.id, created: false });
  });

  it("blocks editing linked transfers, reversing a reversal, and deleting a reversed transfer", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "100");
    const wallet = await usdAccount(user, "Wallet");
    const { id } = await transfer(user, bank, wallet, "25");
    const reversal = await reverseTransfer(user, { id, clientRequestId: randomUUID() });

    const edit = async (target: string) =>
      updateTransfer(user, {
        id: target,
        expectedUpdatedAt: await version(target),
        fromAccountId: bank,
        toAccountId: wallet,
        amount: "1",
        occurredOn: today(),
      });
    await expect(edit(id)).rejects.toThrow(/has been reversed/);
    await expect(edit(reversal.id)).rejects.toThrow(/reverses another/);
    await expect(
      reverseTransfer(user, { id: reversal.id, clientRequestId: randomUUID() }),
    ).rejects.toThrow(/already reverses another/);
    await expect(deleteTransfer(user, id)).rejects.toThrow(/Delete the reversal first/);

    // Undo in order: delete the reversal, then the original.
    await deleteTransfer(user, reversal.id);
    await deleteTransfer(user, id);
    expect(await balance(user, bank)).toBe(10000n);
    expect(await prisma.transfer.count()).toBe(0);
  });

  it("cannot reverse another user's transfer", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const bank = await usdAccount(alice, "Bank", "100");
    const wallet = await usdAccount(alice, "Wallet");
    const { id } = await transfer(alice, bank, wallet, "25");
    await expect(
      reverseTransfer(bob, { id, clientRequestId: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTransfer(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await prisma.transfer.count()).toBe(1);
  });
});

describe("concurrent operations", () => {
  it("keeps balances exact under many concurrent writes", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "Bank", "1000");
    const wallet = await usdAccount(user, "Wallet");
    await Promise.all([
      ...Array.from({ length: 10 }, () => expense(user, bank, "1.11")),
      ...Array.from({ length: 10 }, () => income(user, bank, "2.22")),
      ...Array.from({ length: 10 }, () => transfer(user, bank, wallet, "3.33")),
      ...Array.from({ length: 5 }, () => transfer(user, wallet, bank, "0.01")),
    ]);
    expect(await balance(user, bank)).toBe(100000n - 1110n + 2220n - 3330n + 5n);
    expect(await balance(user, wallet)).toBe(3330n - 5n);
  });

  it("never archives an account while a record is being added to it", async () => {
    const user = await newUser();
    for (let round = 0; round < 5; round += 1) {
      const bank = await usdAccount(user, `Bank ${round}`);
      const results = await Promise.allSettled([
        archiveAccount(user, bank),
        income(user, bank, "5"),
      ]);
      const account = await getAccount(user, bank);
      const [archived, added] = results;
      // Either the income landed first (archive refused: balance not zero),
      // or the archive won (the income was refused). Never both.
      if (added.status === "fulfilled") {
        expect(archived.status).toBe("rejected");
        expect(account.isArchived).toBe(false);
        expect(account.balanceMinor).toBe(500n);
      } else {
        expect(account.isArchived).toBe(true);
        expect(account.balanceMinor).toBe(0n);
      }
    }
  });
});

describe("archived categories under the write lock (FIN-3)", () => {
  // Simulates the race: the service's early check ran while the category was
  // still active, and the archive committed before the write took its locks.
  it("refuses to create or move a record into a category archived after the check", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "ABA", "100");
    const food = await category(user.id, "EXPENSE", "Food and drinks");
    const other = await category(user.id, "EXPENSE", "Shopping");
    const { id } = await expense(user, bank, "5", { categoryId: other });
    await archiveCategory(user, food);

    const data = {
      type: "EXPENSE" as const,
      accountId: bank,
      categoryId: food,
      amountMinor: 700n,
      occurredOn: today(),
      payee: null,
      note: null,
    };
    await expect(repo.createEntry(user.id, randomUUID(), data, () => {})).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      repo.updateEntry(user.id, id, await version(id), data, () => {}, true),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.transaction.count({ where: { categoryId: food } })).toBe(0);
  });

  it("still lets an existing record keep a category that was archived later", async () => {
    const user = await newUser();
    const bank = await usdAccount(user, "ABA", "100");
    const food = await category(user.id, "EXPENSE", "Food and drinks");
    const { id } = await expense(user, bank, "5", { categoryId: food });
    await archiveCategory(user, food);
    await updateEntry(user, {
      id,
      expectedUpdatedAt: await version(id),
      type: "EXPENSE",
      accountId: bank,
      categoryId: food,
      amount: "6",
      occurredOn: today(),
    });
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id } })).amountMinor).toBe(600n);
  });
});
