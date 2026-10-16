import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CATEGORIES } from "@/features/categories/default-categories";
import {
  archiveCategory,
  assertCategoryUsable,
  createCategory,
  deleteCategory,
  listCategories,
  listSelectableCategories,
  restoreCategory,
  updateCategory,
} from "@/features/categories/server/service";
import { isoDateToDb, toIsoDate } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/server/errors";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

async function newUser() {
  const user = await registerTestUser();
  return { id: user.id };
}

async function addAccount(userId: string) {
  return prisma.financialAccount.create({
    data: { userId, name: `Acct ${Math.random()}`, type: "CASH", currency: "USD" },
  });
}

async function useCategory(userId: string, categoryId: string, type: "INCOME" | "EXPENSE") {
  const account = await addAccount(userId);
  return prisma.transaction.create({
    data: {
      userId,
      accountId: account.id,
      categoryId,
      type,
      amountMinor: 500n,
      occurredOn: isoDateToDb(toIsoDate("2026-10-01")),
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
});

describe("default categories", () => {
  it("gives every new user the 5 income and 11 expense defaults", async () => {
    const user = await newUser();
    const categories = await listCategories(user);
    const names = (type: string) =>
      categories
        .filter((c) => c.type === type)
        .map((c) => c.name)
        .sort();
    expect(names("INCOME")).toEqual([
      "Business income",
      "Freelance income",
      "Investment income",
      "Other income",
      "Salary",
    ]);
    expect(names("EXPENSE")).toEqual([
      "Education",
      "Entertainment",
      "Family",
      "Food and drinks",
      "Health",
      "Housing and rent",
      "Other expenses",
      "Shopping",
      "Subscriptions",
      "Transportation",
      "Utilities",
    ]);
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(categories.every((c) => !c.isArchived && c.usageCount === 0)).toBe(true);
  });
});

describe("creating and editing", () => {
  it("creates custom categories with a type and colour token", async () => {
    const user = await newUser();
    const { id } = await createCategory(user, {
      name: "Coffee",
      type: "EXPENSE",
      color: "chart-3",
    });
    const created = (await listCategories(user)).find((c) => c.id === id);
    expect(created).toMatchObject({ name: "Coffee", type: "EXPENSE", color: "chart-3" });
  });

  it("rejects duplicate names within a type, case-insensitively", async () => {
    const user = await newUser();
    await expect(
      createCategory(user, { name: "salary", type: "INCOME", color: "chart-1" }),
    ).rejects.toThrow(/already have an income category/);
    // Same name as a different type is fine.
    await expect(
      createCategory(user, { name: "Salary", type: "EXPENSE", color: "chart-1" }),
    ).resolves.toHaveProperty("id");
  });

  it("allows changing the type only while the category is unused", async () => {
    const user = await newUser();
    const { id } = await createCategory(user, { name: "Gifts", type: "EXPENSE", color: "chart-4" });
    await updateCategory(user, { id, name: "Gifts", type: "INCOME", color: "chart-4" });
    expect((await listCategories(user)).find((c) => c.id === id)?.type).toBe("INCOME");

    await useCategory(user.id, id, "INCOME");
    await expect(
      updateCategory(user, { id, name: "Gifts", type: "EXPENSE", color: "chart-4" }),
    ).rejects.toThrow(/can't switch between income and expense/);
    // Renaming a used category is fine and keeps past records attached.
    await updateCategory(user, { id, name: "Gifts received", type: "INCOME", color: "chart-2" });
    const tx = await prisma.transaction.findFirstOrThrow({ where: { categoryId: id } });
    expect(tx.type).toBe("INCOME");
  });

  it("database also refuses to flip the type of a used category", async () => {
    const user = await newUser();
    const { id } = await createCategory(user, { name: "Rent", type: "EXPENSE", color: "chart-2" });
    await useCategory(user.id, id, "EXPENSE");
    await expect(
      prisma.category.update({ where: { id }, data: { type: "INCOME" } }),
    ).rejects.toThrow(/Foreign key constraint|violates/i);
  });

  it("only accepts palette colour tokens (CHECK constraint)", async () => {
    const user = await newUser();
    await expect(
      prisma.category.create({
        data: { userId: user.id, name: "X", type: "EXPENSE", color: "#ff0000" },
      }),
    ).rejects.toThrow(/categories_color_token_chk/);
  });
});

describe("archiving and deleting", () => {
  it("archives a used category without touching its records, and can restore it", async () => {
    const user = await newUser();
    const { id } = await createCategory(user, {
      name: "Snacks",
      type: "EXPENSE",
      color: "chart-3",
    });
    const tx = await useCategory(user.id, id, "EXPENSE");

    await archiveCategory(user, id);
    const archived = (await listCategories(user)).find((c) => c.id === id);
    expect(archived).toMatchObject({ isArchived: true, transactionCount: 1 });
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).categoryId).toBe(
      id,
    );
    expect((await listSelectableCategories(user, "EXPENSE")).map((c) => c.id)).not.toContain(id);

    await restoreCategory(user, id);
    expect((await listSelectableCategories(user, "EXPENSE")).map((c) => c.id)).toContain(id);
  });

  it("deletes unused categories but refuses used ones", async () => {
    const user = await newUser();
    const { id: unused } = await createCategory(user, {
      name: "Temp",
      type: "EXPENSE",
      color: "chart-1",
    });
    await deleteCategory(user, unused);
    expect(await prisma.category.count({ where: { id: unused } })).toBe(0);

    const { id: used } = await createCategory(user, {
      name: "Used",
      type: "EXPENSE",
      color: "chart-1",
    });
    await useCategory(user.id, used, "EXPENSE");
    await expect(deleteCategory(user, used)).rejects.toThrow(/in use/);
  });

  it("treats a budget as usage too (deleting would silently remove it)", async () => {
    const user = await newUser();
    const { id } = await createCategory(user, {
      name: "Budgeted",
      type: "EXPENSE",
      color: "chart-1",
    });
    await prisma.budget.create({
      data: {
        userId: user.id,
        categoryId: id,
        month: isoDateToDb(toIsoDate("2026-10-01")),
        currency: "USD",
        amountMinor: 1000n,
      },
    });
    await expect(deleteCategory(user, id)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("type rules for new records", () => {
  it("rejects an expense category for income and vice versa", async () => {
    const user = await newUser();
    const categories = await listCategories(user);
    const expense = categories.find((c) => c.type === "EXPENSE")!;
    const income = categories.find((c) => c.type === "INCOME")!;
    await expect(assertCategoryUsable(user, expense.id, "INCOME")).rejects.toThrow(
      /income category/,
    );
    await expect(assertCategoryUsable(user, income.id, "EXPENSE")).rejects.toThrow(
      /expense category/,
    );
    await expect(assertCategoryUsable(user, expense.id, "EXPENSE")).resolves.toBeUndefined();
  });

  it("rejects archived categories for new records", async () => {
    const user = await newUser();
    const { id } = await createCategory(user, { name: "Old", type: "EXPENSE", color: "chart-1" });
    await archiveCategory(user, id);
    await expect(assertCategoryUsable(user, id, "EXPENSE")).rejects.toThrow(/archived/);
  });

  it("lists only active categories of the requested type", async () => {
    const user = await newUser();
    const income = await listSelectableCategories(user, "INCOME");
    expect(income).toHaveLength(5);
    expect(income.every((c) => c.type === "INCOME")).toBe(true);
  });
});

describe("isolation between users", () => {
  it("never shows, edits, archives, deletes or accepts another user's category", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const { id } = await createCategory(alice, {
      name: "Private",
      type: "EXPENSE",
      color: "chart-1",
    });

    expect((await listCategories(bob)).map((c) => c.id)).not.toContain(id);
    await expect(
      updateCategory(bob, { id, name: "Hacked", type: "EXPENSE", color: "chart-2" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveCategory(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restoreCategory(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteCategory(bob, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertCategoryUsable(bob, id, "EXPENSE")).rejects.toBeInstanceOf(NotFoundError);

    const untouched = (await listCategories(alice)).find((c) => c.id === id);
    expect(untouched).toMatchObject({ name: "Private", isArchived: false });
  });
});
