import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/server/auth/session";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Server actions for accounts and categories: authentication first, server-side
 * validation, and the session user as the only owner. The session lookup is a
 * test double; everything beneath it is real.
 */
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth/session")>();
  const { UnauthorizedError } = await import("@/server/errors");
  return {
    ...original,
    getCurrentUser: async () => session.current,
    requireUser: async () => {
      if (!session.current) throw new UnauthorizedError();
      return session.current;
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const accounts = await import("@/features/accounts/actions");
const categories = await import("@/features/categories/actions");

function actAs(user: { id: string; email: string } | null) {
  session.current = user
    ? {
        id: user.id,
        email: user.email,
        name: null,
        timezone: "Asia/Phnom_Penh",
        baseCurrency: "USD",
      }
    : null;
}

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
});

describe("anonymous callers", () => {
  it("are rejected before validation and nothing is written", async () => {
    expect(
      await accounts.createAccountAction({
        name: "",
        type: "BANK",
        currency: "USD",
        openingBalance: "x",
      }),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(
      await categories.createCategoryAction({ name: "X", type: "EXPENSE", color: "chart-1" }),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(await prisma.financialAccount.count()).toBe(0);
  });
});

describe("validation on the server", () => {
  it("returns field errors for invalid account input", async () => {
    actAs(await registerTestUser());
    const result = await accounts.createAccountAction({
      name: "  ",
      // @ts-expect-error — invalid enum values must be rejected server-side
      type: "CRYPTO",
      // @ts-expect-error — unsupported currency must be rejected server-side
      currency: "EUR",
      openingBalance: "1",
    });
    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: {
        name: "Enter a name.",
        type: "Choose an account type.",
        currency: "Choose a currency.",
      },
    });
  });

  it("returns the money parser's message for a bad opening balance", async () => {
    actAs(await registerTestUser());
    const result = await accounts.createAccountAction({
      name: "Riel",
      type: "CASH",
      currency: "KHR",
      openingBalance: "12.5",
    });
    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { openingBalance: "KHR amounts must be whole numbers." },
    });
  });

  it("rejects malformed ids without touching the database", async () => {
    actAs(await registerTestUser());
    expect(await accounts.archiveAccountAction({ id: "not-a-uuid" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
  });
});

describe("ownership", () => {
  it("creates records for the session user only, ignoring a supplied userId", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    actAs(alice);
    const result = await accounts.createAccountAction({
      name: "Mine",
      type: "CASH",
      currency: "USD",
      openingBalance: "1",
      // @ts-expect-error — stripped by the schema
      userId: bob.id,
    });
    expect(result.ok).toBe(true);
    const created = await prisma.financialAccount.findFirstOrThrow({ where: { name: "Mine" } });
    expect(created.userId).toBe(alice.id);
  });

  it("reports another user's account or category as not found and leaves it unchanged", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    const account = await prisma.financialAccount.create({
      data: { userId: alice.id, name: "Alice", type: "BANK", currency: "USD" },
    });
    const category = await prisma.category.findFirstOrThrow({ where: { userId: alice.id } });

    actAs(bob);
    expect(
      await accounts.updateAccountAction({
        id: account.id,
        name: "x",
        type: "CASH",
        openingBalance: "0",
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await accounts.deleteAccountAction({ id: account.id })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await categories.archiveCategoryAction({ id: category.id })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await categories.deleteCategoryAction({ id: category.id })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });

    expect(
      await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } }),
    ).toMatchObject({
      name: "Alice",
    });
    expect(await prisma.category.findUniqueOrThrow({ where: { id: category.id } })).toMatchObject({
      isArchived: false,
    });
  });
});
