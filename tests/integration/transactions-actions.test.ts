import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayInTimeZone } from "@/lib/dates";
import type { CurrentUser } from "@/server/auth/session";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Transaction server actions: authentication first, Zod validation on the
 * server, and the session user as the only owner. The session lookup is a
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

const actions = await import("@/features/transactions/actions");

const TZ = "Asia/Phnom_Penh";
const today = () => todayInTimeZone(TZ);

function actAs(user: { id: string; email: string } | null) {
  session.current = user
    ? { id: user.id, email: user.email, name: null, timezone: TZ, baseCurrency: "USD" }
    : null;
}

async function owner() {
  const user = await registerTestUser();
  const account = await prisma.financialAccount.create({
    data: {
      userId: user.id,
      name: "Bank",
      type: "BANK",
      currency: "USD",
      openingBalanceMinor: 10000n,
    },
  });
  const wallet = await prisma.financialAccount.create({
    data: { userId: user.id, name: "Wallet", type: "DIGITAL_WALLET", currency: "USD" },
  });
  const category = await prisma.category.findFirstOrThrow({
    where: { userId: user.id, type: "EXPENSE" },
  });
  return { user, account, wallet, category };
}

function expenseInput(o: Awaited<ReturnType<typeof owner>>, extra: object = {}) {
  return {
    type: "EXPENSE" as const,
    accountId: o.account.id,
    categoryId: o.category.id,
    amount: "12.34",
    occurredOn: today(),
    clientRequestId: randomUUID(),
    ...extra,
  };
}

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
});

describe("anonymous callers", () => {
  it("are rejected before validation and nothing is written", async () => {
    const o = await owner();
    const id = randomUUID();
    for (const result of [
      await actions.createEntryAction(expenseInput(o)),
      await actions.createEntryAction({} as never),
      await actions.createTransferAction({
        fromAccountId: o.account.id,
        toAccountId: o.wallet.id,
        amount: "1",
        occurredOn: today(),
        clientRequestId: randomUUID(),
      }),
      await actions.deleteRecordAction({ id }),
      await actions.reverseTransferAction({ id, clientRequestId: randomUUID() }),
    ]) {
      expect(result).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    }
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.transfer.count()).toBe(0);
  });
});

describe("validation", () => {
  it("returns field errors for malformed input", async () => {
    const o = await owner();
    actAs(o.user);
    const result = await actions.createEntryAction(
      expenseInput(o, { amount: "", occurredOn: "2026-02-30", type: "TRANSFER" }),
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors ?? {})).toEqual(
        expect.arrayContaining(["amount", "occurredOn", "type"]),
      );
    }
  });

  it("returns business-rule errors on the right field", async () => {
    const o = await owner();
    actAs(o.user);
    expect(await actions.createEntryAction(expenseInput(o, { amount: "0" }))).toMatchObject({
      ok: false,
      fieldErrors: { amount: "Amount must be greater than zero." },
    });
    const income = await prisma.category.findFirstOrThrow({
      where: { userId: o.user.id, type: "INCOME" },
    });
    expect(
      await actions.createEntryAction(expenseInput(o, { categoryId: income.id })),
    ).toMatchObject({ ok: false, fieldErrors: { categoryId: expect.stringMatching(/expense/) } });
    expect(
      await actions.createTransferAction({
        fromAccountId: o.account.id,
        toAccountId: o.account.id,
        amount: "1",
        occurredOn: today(),
        clientRequestId: randomUUID(),
      }),
    ).toMatchObject({ ok: false, fieldErrors: { toAccountId: "Choose two different accounts." } });
  });

  it("ignores any owner id smuggled into the input", async () => {
    const o = await owner();
    const other = await registerTestUser();
    actAs(o.user);
    const result = await actions.createEntryAction({
      ...expenseInput(o),
      userId: other.id,
    } as never);
    expect(result.ok).toBe(true);
    const row = await prisma.transaction.findFirstOrThrow();
    expect(row.userId).toBe(o.user.id);
  });
});

describe("ownership", () => {
  it("cannot use, read, change, delete or reverse another user's records", async () => {
    const alice = await owner();
    const bob = await owner();
    actAs(alice.user);
    const created = await actions.createEntryAction(expenseInput(alice));
    const transfer = await actions.createTransferAction({
      fromAccountId: alice.account.id,
      toAccountId: alice.wallet.id,
      amount: "5",
      occurredOn: today(),
      clientRequestId: randomUUID(),
    });
    if (!created.ok || !transfer.ok) throw new Error("setup failed");
    const entryRow = await prisma.transaction.findUniqueOrThrow({ where: { id: created.data.id } });

    actAs(bob.user);
    // Bob's records may not reference Alice's account or category.
    expect(
      await actions.createEntryAction(expenseInput(bob, { accountId: alice.account.id })),
    ).toMatchObject({ ok: false });
    expect(
      await actions.createEntryAction(expenseInput(bob, { categoryId: alice.category.id })),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      await actions.updateEntryAction({
        ...expenseInput(bob),
        id: created.data.id,
        expectedUpdatedAt: entryRow.updatedAt.toISOString(),
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await actions.deleteRecordAction({ id: created.data.id })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await actions.deleteRecordAction({ id: transfer.data.id })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      await actions.reverseTransferAction({ id: transfer.data.id, clientRequestId: randomUUID() }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });

    expect(await prisma.transaction.count({ where: { userId: bob.user.id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: alice.user.id } })).toBe(1);
    expect(await prisma.transfer.count()).toBe(1);
  });
});

describe("happy path", () => {
  it("creates, edits, reverses and deletes through the actions", async () => {
    const o = await owner();
    actAs(o.user);
    const created = await actions.createEntryAction(expenseInput(o));
    expect(created).toMatchObject({ ok: true, data: { created: true } });
    if (!created.ok) return;
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(
      await actions.updateEntryAction({
        ...expenseInput(o, { amount: "20" }),
        id: row.id,
        expectedUpdatedAt: row.updatedAt.toISOString(),
      }),
    ).toMatchObject({ ok: true });
    // A second save with the old version is a conflict, not a silent overwrite.
    expect(
      await actions.updateEntryAction({
        ...expenseInput(o, { amount: "30" }),
        id: row.id,
        expectedUpdatedAt: row.updatedAt.toISOString(),
      }),
    ).toMatchObject({ ok: false, code: "CONFLICT" });

    const transfer = await actions.createTransferAction({
      fromAccountId: o.account.id,
      toAccountId: o.wallet.id,
      amount: "5",
      occurredOn: today(),
      clientRequestId: randomUUID(),
    });
    if (!transfer.ok) throw new Error("transfer failed");
    expect(
      await actions.reverseTransferAction({ id: transfer.data.id, clientRequestId: randomUUID() }),
    ).toMatchObject({ ok: true, data: { created: true } });

    expect(await actions.deleteRecordAction({ id: row.id })).toMatchObject({ ok: true });
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.transfer.count()).toBe(2);
  });
});
