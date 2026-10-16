import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/server/auth/session";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/** Budget server actions: authentication first, server validation, session user as owner. */
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

const actions = await import("@/features/budgets/actions");

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

async function owner() {
  const user = await registerTestUser();
  const food = await prisma.category.findFirstOrThrow({
    where: { userId: user.id, name: "Food and drinks" },
  });
  return { user, food };
}

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
});

describe("budget actions", () => {
  it("reject anonymous callers before validation", async () => {
    const id = randomUUID();
    for (const result of [
      await actions.createBudgetAction({} as never),
      await actions.updateBudgetAction({
        id,
        amount: "1",
        alertThresholdPercent: 80,
        expectedUpdatedAt: new Date().toISOString(),
      }),
      await actions.archiveBudgetAction({ id }),
      await actions.deleteBudgetAction({ id }),
      await actions.copyPreviousMonthAction({ month: "2026-03" }),
      await actions.markAlertsReadAction({}),
    ]) {
      expect(result).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    }
  });

  it("validate input on the server", async () => {
    const o = await owner();
    actAs(o.user);
    const result = await actions.createBudgetAction({
      categoryId: o.food.id,
      currency: "EUR" as never,
      month: "2026-13",
      amount: "",
      alertThresholdPercent: 0,
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors ?? {})).toEqual(
        expect.arrayContaining(["currency", "month", "amount", "alertThresholdPercent"]),
      );
    }
  });

  it("create for the session user only and hide budgets from other users", async () => {
    const alice = await owner();
    const bob = await owner();
    actAs(alice.user);
    const created = await actions.createBudgetAction({
      categoryId: alice.food.id,
      currency: "USD",
      month: "2026-03",
      amount: "200",
      alertThresholdPercent: 80,
      userId: bob.user.id,
    } as never);
    if (!created.ok) throw new Error(created.error);
    expect((await prisma.budget.findUniqueOrThrow({ where: { id: created.data.id } })).userId).toBe(
      alice.user.id,
    );

    actAs(bob.user);
    expect(await actions.archiveBudgetAction({ id: created.data.id })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await actions.deleteBudgetAction({ id: created.data.id })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      await actions.createBudgetAction({
        categoryId: alice.food.id,
        currency: "USD",
        month: "2026-03",
        amount: "1",
        alertThresholdPercent: 80,
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await prisma.budget.count()).toBe(1);
  });
});
