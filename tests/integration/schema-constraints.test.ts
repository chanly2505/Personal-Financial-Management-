import { beforeEach, describe, expect, it } from "vitest";
import { isoDateToDb, toIsoDate } from "@/lib/dates";
import { createTestUser, prisma, resetDatabase } from "../helpers/db";

/**
 * These tests prove the database itself enforces the integrity rules in
 * docs/DATABASE.md, independent of any application code.
 */

const day = (iso: string) => isoDateToDb(toIsoDate(iso));

async function seedOwner() {
  const user = await createTestUser();
  const account = await prisma.financialAccount.create({
    data: { userId: user.id, name: "Wallet", type: "CASH", currency: "USD" },
  });
  const expenseCategory = await prisma.category.create({
    data: { userId: user.id, name: "Food", type: "EXPENSE" },
  });
  const incomeCategory = await prisma.category.create({
    data: { userId: user.id, name: "Salary", type: "INCOME" },
  });
  return { user, account, expenseCategory, incomeCategory };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("transactions", () => {
  it("accepts a valid expense", async () => {
    const { user, account, expenseCategory } = await seedOwner();
    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        categoryId: expenseCategory.id,
        type: "EXPENSE",
        amountMinor: 1250n,
        occurredOn: day("2026-10-15"),
      },
    });
    expect(tx.amountMinor).toBe(1250n);
  });

  it.each([0n, -100n])("rejects non-positive amount %s", async (amountMinor) => {
    const { user, account, expenseCategory } = await seedOwner();
    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          accountId: account.id,
          categoryId: expenseCategory.id,
          type: "EXPENSE",
          amountMinor,
          occurredOn: day("2026-10-15"),
        },
      }),
    ).rejects.toThrow(/transactions_amount_positive_chk/);
  });

  it("rejects a category whose type does not match the transaction type", async () => {
    const { user, account, incomeCategory } = await seedOwner();
    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          accountId: account.id,
          categoryId: incomeCategory.id,
          type: "EXPENSE",
          amountMinor: 100n,
          occurredOn: day("2026-10-15"),
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/i);
  });

  it("rejects linking to another user's account or category", async () => {
    const alice = await seedOwner();
    const bob = await seedOwner();

    await expect(
      prisma.transaction.create({
        data: {
          userId: bob.user.id,
          accountId: alice.account.id,
          categoryId: bob.expenseCategory.id,
          type: "EXPENSE",
          amountMinor: 100n,
          occurredOn: day("2026-10-15"),
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/i);

    await expect(
      prisma.transaction.create({
        data: {
          userId: bob.user.id,
          accountId: bob.account.id,
          categoryId: alice.expenseCategory.id,
          type: "EXPENSE",
          amountMinor: 100n,
          occurredOn: day("2026-10-15"),
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/i);
  });

  it("blocks deleting an account that still has transactions", async () => {
    const { user, account, expenseCategory } = await seedOwner();
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        categoryId: expenseCategory.id,
        type: "EXPENSE",
        amountMinor: 100n,
        occurredOn: day("2026-10-15"),
      },
    });
    await expect(prisma.financialAccount.delete({ where: { id: account.id } })).rejects.toThrow();
  });
});

describe("recurring transactions", () => {
  it("prevents materialising the same occurrence twice", async () => {
    const { user, account, expenseCategory } = await seedOwner();
    const rule = await prisma.recurringRule.create({
      data: {
        name: "Rent",
        userId: user.id,
        accountId: account.id,
        categoryId: expenseCategory.id,
        type: "EXPENSE",
        amountMinor: 999n,
        frequency: "MONTHLY",
        startOn: day("2026-01-31"),
        nextOccurrenceOn: day("2026-01-31"),
      },
    });
    const occurrence = {
      userId: user.id,
      accountId: account.id,
      categoryId: expenseCategory.id,
      type: "EXPENSE" as const,
      amountMinor: 999n,
      occurredOn: day("2026-01-31"),
      recurringRuleId: rule.id,
      recurrenceDate: day("2026-01-31"),
    };
    await prisma.transaction.create({ data: occurrence });
    await expect(prisma.transaction.create({ data: occurrence })).rejects.toThrow(
      /Unique constraint/i,
    );

    const result = await prisma.transaction.createMany({
      data: [occurrence],
      skipDuplicates: true,
    });
    expect(result.count).toBe(0);
  });

  it("requires rule id and recurrence date together", async () => {
    const { user, account, expenseCategory } = await seedOwner();
    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          accountId: account.id,
          categoryId: expenseCategory.id,
          type: "EXPENSE",
          amountMinor: 100n,
          occurredOn: day("2026-10-15"),
          recurrenceDate: day("2026-10-15"),
        },
      }),
    ).rejects.toThrow(/transactions_recurrence_pair_chk/);
  });
});

describe("transfers", () => {
  it("rejects a transfer to the same account", async () => {
    const { user, account } = await seedOwner();
    await expect(
      prisma.transfer.create({
        data: {
          userId: user.id,
          fromAccountId: account.id,
          toAccountId: account.id,
          fromAmountMinor: 100n,
          toAmountMinor: 100n,
          occurredOn: day("2026-10-15"),
        },
      }),
    ).rejects.toThrow(/transfers_distinct_accounts_chk/);
  });

  it("rejects a transfer into another user's account", async () => {
    const alice = await seedOwner();
    const bob = await seedOwner();
    await expect(
      prisma.transfer.create({
        data: {
          userId: alice.user.id,
          fromAccountId: alice.account.id,
          toAccountId: bob.account.id,
          fromAmountMinor: 100n,
          toAmountMinor: 100n,
          occurredOn: day("2026-10-15"),
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/i);
  });

  it("rejects a transfer between accounts in different currencies, even with equal amounts (FIN-4)", async () => {
    const { user, account } = await seedOwner();
    const riel = await prisma.financialAccount.create({
      data: { userId: user.id, name: "Cash riel", type: "CASH", currency: "KHR" },
    });
    await expect(
      prisma.transfer.create({
        data: {
          userId: user.id,
          fromAccountId: account.id,
          toAccountId: riel.id,
          fromAmountMinor: 100n,
          toAmountMinor: 100n,
          occurredOn: day("2026-10-15"),
        },
      }),
    ).rejects.toThrow(/same currency/);
  });
});

describe("account currency (FIN-4)", () => {
  it("cannot change once the account has records, but can before", async () => {
    const { user, account, expenseCategory } = await seedOwner();
    // No records yet: allowed (nothing in the app does this, but it is harmless).
    await prisma.financialAccount.update({ where: { id: account.id }, data: { currency: "KHR" } });
    await prisma.financialAccount.update({ where: { id: account.id }, data: { currency: "USD" } });

    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        categoryId: expenseCategory.id,
        type: "EXPENSE",
        amountMinor: 500n,
        occurredOn: day("2026-10-15"),
      },
    });
    await expect(
      prisma.financialAccount.update({ where: { id: account.id }, data: { currency: "KHR" } }),
    ).rejects.toThrow(/currency cannot change/);
    // Other edits to the account still work.
    await prisma.financialAccount.update({ where: { id: account.id }, data: { name: "Purse" } });
  });
});

describe("budgets", () => {
  it("only allows expense categories", async () => {
    const { user, incomeCategory } = await seedOwner();
    await expect(
      prisma.budget.create({
        data: {
          userId: user.id,
          categoryId: incomeCategory.id,
          month: day("2026-10-01"),
          currency: "USD",
          amountMinor: 10000n,
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/i);
  });

  it("requires the month to be stored as its first day", async () => {
    const { user, expenseCategory } = await seedOwner();
    await expect(
      prisma.budget.create({
        data: {
          userId: user.id,
          categoryId: expenseCategory.id,
          month: day("2026-10-15"),
          currency: "USD",
          amountMinor: 10000n,
        },
      }),
    ).rejects.toThrow(/budgets_month_first_day_chk/);
  });
});

describe("users", () => {
  it("rejects emails that are not normalised", async () => {
    await expect(createTestUser({ email: "Mixed@Example.test" })).rejects.toThrow(
      /users_email_lowercase_chk/,
    );
  });

  it("deleting a user removes all of their financial data", async () => {
    const { user, account, expenseCategory } = await seedOwner();
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        categoryId: expenseCategory.id,
        type: "EXPENSE",
        amountMinor: 100n,
        occurredOn: day("2026-10-15"),
      },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.financialAccount.count()).toBe(0);
    expect(await prisma.category.count()).toBe(0);
  });
});
