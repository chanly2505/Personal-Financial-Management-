import { beforeEach, describe, expect, it } from "vitest";

import {
  archiveAccount,
  createAccount,
  deleteAccount,
  getAccount,
  getAccountsOverview,
  getUsableAccount,
  restoreAccount,
  updateAccount,
} from "@/features/accounts/server/service";
import { addDays, isoDateToDb, todayInTimeZone } from "@/lib/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

const TZ = "Asia/Phnom_Penh";
type U = { id: string; timezone: string };

async function newUser(): Promise<U> {
  const user = await registerTestUser();
  return { id: user.id, timezone: TZ };
}

const usd = (name: string, openingBalance = "0") =>
  ({ name, type: "BANK", currency: "USD", openingBalance }) as const;

async function expenseCategoryId(userId: string) {
  return (await prisma.category.findFirstOrThrow({ where: { userId, type: "EXPENSE" } })).id;
}
async function incomeCategoryId(userId: string) {
  return (await prisma.category.findFirstOrThrow({ where: { userId, type: "INCOME" } })).id;
}

function day(offset: number) {
  return isoDateToDb(addDays(todayInTimeZone(TZ), offset));
}

beforeEach(async () => {
  await resetDatabase();
});

describe("creating accounts", () => {
  it("stores the opening balance exactly in minor units per currency", async () => {
    const user = await newUser();
    const { id: usdId } = await createAccount(user, usd("ABA Bank", "1,250.50"));
    const { id: khrId } = await createAccount(user, {
      name: "Cash (riel)",
      type: "CASH",
      currency: "KHR",
      openingBalance: "400,000",
    });
    expect((await getAccount(user, usdId)).openingBalanceMinor).toBe(125050n);
    expect((await getAccount(user, khrId)).openingBalanceMinor).toBe(400000n);
  });

  it("treats an empty opening balance as zero and allows negatives (overdrawn)", async () => {
    const user = await newUser();
    const { id } = await createAccount(user, usd("Empty"));
    expect((await getAccount(user, id)).balanceMinor).toBe(0n);
    const { id: od } = await createAccount(user, usd("Overdrawn", "-25.10"));
    expect((await getAccount(user, od)).balanceMinor).toBe(-2510n);
  });

  it.each([
    ["KHR with decimals", "KHR", "1000.50", /whole numbers/],
    ["USD with 3 decimals", "USD", "1.005", /at most 2 decimal/],
    ["not a number", "USD", "abc", /valid number/],
    ["too large", "USD", "99999999999999999", /too large/],
  ] as const)("rejects %s", async (_label, currency, openingBalance, message) => {
    const user = await newUser();
    const attempt = createAccount(user, { name: "X", type: "BANK", currency, openingBalance });
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toThrow(message);
    expect(await prisma.financialAccount.count({ where: { userId: user.id } })).toBe(0);
  });

  it("rejects duplicate names case-insensitively, including archived accounts", async () => {
    const user = await newUser();
    await createAccount(user, usd("Wing"));
    await expect(createAccount(user, usd("  wing "))).rejects.toThrow(/already have an account/);

    const { id } = await createAccount(user, usd("Old wallet"));
    await archiveAccount(user, id);
    await expect(createAccount(user, usd("OLD WALLET"))).rejects.toThrow(/archived account/);
  });

  it("lets different users use the same account name", async () => {
    const alice = await newUser();
    const bob = await newUser();
    await createAccount(alice, usd("ABA Bank"));
    await expect(createAccount(bob, usd("ABA Bank"))).resolves.toHaveProperty("id");
  });
});

describe("editing accounts", () => {
  it("updates name, type and opening balance but never the currency", async () => {
    const user = await newUser();
    const { id } = await createAccount(user, usd("Bank", "10"));
    await updateAccount(user, {
      id,
      name: "ACLEDA Savings",
      type: "BANK",
      openingBalance: "20.25",
      // @ts-expect-error — not accepted by the service; must be ignored
      currency: "KHR",
    });
    const account = await getAccount(user, id);
    expect(account).toMatchObject({
      name: "ACLEDA Savings",
      currency: "USD",
      openingBalanceMinor: 2025n,
    });
  });

  it("parses the opening balance with the account's own currency", async () => {
    const user = await newUser();
    const { id } = await createAccount(user, {
      name: "Riel",
      type: "CASH",
      currency: "KHR",
      openingBalance: "0",
    });
    await expect(
      updateAccount(user, { id, name: "Riel", type: "CASH", openingBalance: "10.50" }),
    ).rejects.toThrow(/whole numbers/);
  });
});

describe("balances", () => {
  it("derive from opening balance, income, expenses and transfers in both directions", async () => {
    const user = await newUser();
    const { id: bank } = await createAccount(user, usd("Bank", "1000"));
    const { id: cash } = await createAccount(user, {
      name: "Cash",
      type: "CASH",
      currency: "USD",
      openingBalance: "50",
    });
    await prisma.transaction.createMany({
      data: [
        {
          userId: user.id,
          accountId: bank,
          categoryId: await incomeCategoryId(user.id),
          type: "INCOME",
          amountMinor: 50000n,
          occurredOn: day(-3),
        },
        {
          userId: user.id,
          accountId: bank,
          categoryId: await expenseCategoryId(user.id),
          type: "EXPENSE",
          amountMinor: 12345n,
          occurredOn: day(-2),
        },
      ],
    });
    await prisma.transfer.create({
      data: {
        userId: user.id,
        fromAccountId: bank,
        toAccountId: cash,
        fromAmountMinor: 2000n,
        toAmountMinor: 2000n,
        occurredOn: day(-1),
      },
    });

    // bank: 1000.00 + 500.00 − 123.45 − 20.00 = 1356.55
    expect((await getAccount(user, bank)).balanceMinor).toBe(135655n);
    // cash: 50.00 + 20.00
    expect((await getAccount(user, cash)).balanceMinor).toBe(7000n);
  });

  it("cannot hold a cross-currency transfer in v1 (both legs must be equal)", async () => {
    const user = await newUser();
    const { id: usdId } = await createAccount(user, usd("USD", "100"));
    const { id: khrId } = await createAccount(user, {
      name: "KHR",
      type: "CASH",
      currency: "KHR",
      openingBalance: "0",
    });
    await expect(
      prisma.transfer.create({
        data: {
          userId: user.id,
          fromAccountId: usdId,
          toAccountId: khrId,
          fromAmountMinor: 1000n,
          toAmountMinor: 41000n,
          occurredOn: day(0),
        },
      }),
    ).rejects.toThrow(/transfers_same_amount_chk/);
    expect((await getAccount(user, usdId)).balanceMinor).toBe(10000n);
  });

  it("excludes future-dated records from the current balance but not the projection", async () => {
    const user = await newUser();
    const { id } = await createAccount(user, usd("Bank", "100"));
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: id,
        categoryId: await expenseCategoryId(user.id),
        type: "EXPENSE",
        amountMinor: 3000n,
        occurredOn: day(5),
      },
    });
    const account = await getAccount(user, id);
    expect(account.balanceMinor).toBe(10000n);
    expect(account.projectedBalanceMinor).toBe(7000n);
  });

  it("keeps one total per currency, active accounts only, never combined", async () => {
    const user = await newUser();
    await createAccount(user, usd("A", "10"));
    await createAccount(user, usd("B", "5.50"));
    await createAccount(user, { name: "R", type: "CASH", currency: "KHR", openingBalance: "8000" });
    const { id: archived } = await createAccount(user, usd("Gone"));
    await archiveAccount(user, archived);

    const overview = await getAccountsOverview(user);
    expect(overview.totals).toEqual([
      { currency: "USD", balanceMinor: 1550n, accountCount: 2 },
      { currency: "KHR", balanceMinor: 8000n, accountCount: 1 },
    ]);
    expect(overview.active.map((a) => a.name)).toEqual(["A", "B", "R"]);
    expect(overview.archived.map((a) => a.name)).toEqual(["Gone"]);
  });
});

describe("archiving, restoring and deleting", () => {
  it("refuses to archive an account that still holds money (PRD Q-10)", async () => {
    const user = await newUser();
    const { id } = await createAccount(user, usd("Bank", "12.34"));
    await expect(archiveAccount(user, id)).rejects.toThrow(/still holds \$12\.34/);
    expect((await getAccount(user, id)).isArchived).toBe(false);
  });

  it("archives a zero-balance account with history, keeping every record", async () => {
    const user = await newUser();
    const { id } = await createAccount(user, usd("Bank", "0"));
    const categoryId = await expenseCategoryId(user.id);
    await prisma.transaction.createMany({
      data: [
        {
          userId: user.id,
          accountId: id,
          categoryId: await incomeCategoryId(user.id),
          type: "INCOME",
          amountMinor: 500n,
          occurredOn: day(-2),
        },
        {
          userId: user.id,
          accountId: id,
          categoryId,
          type: "EXPENSE",
          amountMinor: 500n,
          occurredOn: day(-1),
        },
      ],
    });
    await archiveAccount(user, id);
    const account = await getAccount(user, id);
    expect(account.isArchived).toBe(true);
    expect(account.archivedAt).toBeInstanceOf(Date);
    expect(await prisma.transaction.count({ where: { accountId: id } })).toBe(2);
    await expect(getUsableAccount(user, id)).rejects.toThrow(/archived/);

    await restoreAccount(user, id);
    expect((await getAccount(user, id)).isArchived).toBe(false);
    await expect(getUsableAccount(user, id)).resolves.toMatchObject({ id, currency: "USD" });
  });

  it("will not restore an account whose name is now taken", async () => {
    const user = await newUser();
    const { id } = await createAccount(user, usd("Wallet"));
    await archiveAccount(user, id);
    await prisma.financialAccount.update({ where: { id }, data: { name: "Wallet" } });
    await prisma.financialAccount.create({
      data: { userId: user.id, name: "wallet", type: "CASH", currency: "USD" },
    });
    await expect(restoreAccount(user, id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("deletes an unused account but only archives one with history", async () => {
    const user = await newUser();
    const { id: unused } = await createAccount(user, usd("Unused", "5"));
    await deleteAccount(user, unused);
    expect(await prisma.financialAccount.count({ where: { id: unused } })).toBe(0);

    const { id: used } = await createAccount(user, usd("Used"));
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: used,
        categoryId: await expenseCategoryId(user.id),
        type: "EXPENSE",
        amountMinor: 1n,
        occurredOn: day(0),
      },
    });
    await expect(deleteAccount(user, used)).rejects.toThrow(/has history/);
    expect(await prisma.financialAccount.count({ where: { id: used } })).toBe(1);
  });
});

describe("isolation between users", () => {
  it("never shows, edits, archives or deletes another user's account", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const { id } = await createAccount(alice, usd("Alice bank", "0"));

    await expect(getAccount(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateAccount(bob, { id, name: "Hacked", type: "CASH", openingBalance: "999" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveAccount(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restoreAccount(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteAccount(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getUsableAccount(bob, id)).rejects.toBeInstanceOf(NotFoundError);

    const overview = await getAccountsOverview(bob);
    expect(overview.active).toHaveLength(0);
    expect(overview.totals).toHaveLength(0);

    const untouched = await getAccount(alice, id);
    expect(untouched).toMatchObject({
      name: "Alice bank",
      openingBalanceMinor: 0n,
      isArchived: false,
    });
  });

  it("does not count another user's transactions in a balance", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const { id } = await createAccount(alice, usd("Bank", "100"));
    // Bob cannot even write a record against Alice's account (composite FK).
    await expect(
      prisma.transaction.create({
        data: {
          userId: bob.id,
          accountId: id,
          categoryId: await expenseCategoryId(bob.id),
          type: "EXPENSE",
          amountMinor: 100n,
          occurredOn: day(0),
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/i);
    expect((await getAccount(alice, id)).balanceMinor).toBe(10000n);
  });
});

describe("database constraints", () => {
  it("keeps the archived flag and timestamp consistent", async () => {
    const user = await newUser();
    const { id } = await createAccount(user, usd("Bank"));
    await expect(
      prisma.financialAccount.update({ where: { id }, data: { isArchived: true } }),
    ).rejects.toThrow(/accounts_archived_consistent_chk/);
  });

  it("caps the opening balance range", async () => {
    const user = await newUser();
    await expect(
      prisma.financialAccount.create({
        data: {
          userId: user.id,
          name: "Huge",
          type: "BANK",
          currency: "USD",
          openingBalanceMinor: 10n ** 16n,
        },
      }),
    ).rejects.toThrow(/accounts_opening_balance_range_chk/);
  });
});
