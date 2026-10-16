import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  archiveAccount,
  createAccount,
  getAccountsOverview,
} from "@/features/accounts/server/service";
import {
  addContribution,
  archiveGoal,
  createGoal,
  deleteContribution,
  deleteGoal,
  getGoal,
  listGoals,
  restoreGoal,
  updateGoal,
} from "@/features/goals/server/service";
import { addDays, todayInTimeZone } from "@/lib/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/** Savings goals (earmark model, Q-7 A) against a real database. */

const TZ = "Asia/Phnom_Penh";
type U = { id: string; timezone: string };
const today = () => todayInTimeZone(TZ);

async function setup() {
  const registered = await registerTestUser();
  const user: U = { id: registered.id, timezone: TZ };
  const bank = (
    await createAccount(user, { name: "ABA", type: "BANK", currency: "USD", openingBalance: "500" })
  ).id;
  const cash = (
    await createAccount(user, { name: "Cash", type: "CASH", currency: "KHR", openingBalance: "0" })
  ).id;
  return { user, bank, cash };
}

const goal = (user: U, extra: Record<string, string> = {}) =>
  createGoal(user, { name: "Emergency fund", currency: "USD", target: "1000", ...extra });

const put = (
  user: U,
  goalId: string,
  amount: string,
  kind: "DEPOSIT" | "WITHDRAWAL" = "DEPOSIT",
  extra: Record<string, string> = {},
) =>
  addContribution(user, {
    goalId,
    kind,
    amount,
    occurredOn: today(),
    clientRequestId: randomUUID(),
    ...extra,
  });

beforeEach(async () => {
  await resetDatabase();
});

describe("contributions are earmarks", () => {
  it("track progress without changing any account balance or the ledger", async () => {
    const { user, bank } = await setup();
    const { id } = await goal(user, { accountId: bank });
    const before = await getAccountsOverview(user);
    await put(user, id, "250.50");
    await put(user, id, "100", "WITHDRAWAL");
    const after = await getAccountsOverview(user);
    expect(after.totals).toEqual(before.totals);
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.transfer.count()).toBe(0);
    // 250.50 − 100 = 150.50 of 1,000 → 15 %, 849.50 left.
    expect((await getGoal(user, id)).goal).toMatchObject({
      savedMinor: 15050n,
      remainingMinor: 84950n,
      percent: 15,
      achieved: false,
    });
  });

  it("is achieved at the target and allows saving beyond it", async () => {
    const { user } = await setup();
    const { id } = await goal(user, { target: "100" });
    await put(user, id, "100");
    expect((await getGoal(user, id)).goal).toMatchObject({
      achieved: true,
      percent: 100,
      remainingMinor: 0n,
    });
    await put(user, id, "25");
    expect((await getGoal(user, id)).goal).toMatchObject({
      achieved: true,
      percent: 125,
      savedMinor: 12500n,
    });
  });

  it("shows the monthly amount needed for a dated goal", async () => {
    const { user } = await setup();
    const { id } = await goal(user, { target: "1200", targetDate: addDays(today(), 60) });
    const { goal: view } = await getGoal(user, id);
    expect(view.monthsLeft).toBeGreaterThanOrEqual(2);
    expect(view.monthlyNeededMinor).toBe(
      (120000n + BigInt(view.monthsLeft!) - 1n) / BigInt(view.monthsLeft!),
    );
  });
});

describe("saved never goes below zero", () => {
  it("rejects a withdrawal larger than saved", async () => {
    const { user } = await setup();
    const { id } = await goal(user);
    await put(user, id, "50");
    await expect(put(user, id, "50.01", "WITHDRAWAL")).rejects.toThrow(/at most \$50\.00/);
    await put(user, id, "50", "WITHDRAWAL");
    expect((await getGoal(user, id)).goal.savedMinor).toBe(0n);
  });

  it("holds when withdrawals race", async () => {
    const { user } = await setup();
    const { id } = await goal(user);
    await put(user, id, "100");
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => put(user, id, "60", "WITHDRAWAL")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getGoal(user, id)).goal.savedMinor).toBe(4000n);
  });

  it("refuses to delete a contribution that later withdrawals rely on", async () => {
    const { user } = await setup();
    const { id } = await goal(user);
    const { id: deposit } = await put(user, id, "100");
    const { id: withdrawal } = await put(user, id, "80", "WITHDRAWAL");
    await expect(deleteContribution(user, { goalId: id, contributionId: deposit })).rejects.toThrow(
      /negative/,
    );
    await deleteContribution(user, { goalId: id, contributionId: withdrawal });
    await deleteContribution(user, { goalId: id, contributionId: deposit });
    expect((await getGoal(user, id)).goal.savedMinor).toBe(0n);
  });
});

describe("validation", () => {
  it.each([
    ["zero", "0", /greater than zero/],
    ["negative", "-5", /cannot be negative/],
    ["text", "lots", /valid number/],
  ] as const)("rejects a %s contribution amount", async (_l, amount, message) => {
    const { user } = await setup();
    const { id } = await goal(user);
    await expect(put(user, id, amount)).rejects.toThrow(message);
  });

  it("rejects future contribution dates, KHR decimals and bad targets", async () => {
    const { user } = await setup();
    const { id } = await goal(user);
    await expect(
      put(user, id, "10", "DEPOSIT", { occurredOn: addDays(today(), 1) }),
    ).rejects.toThrow(/up to today/);
    const { id: riel } = await goal(user, { name: "Phone", currency: "KHR", target: "4,000,000" });
    await expect(put(user, riel, "10.5")).rejects.toThrow(/whole numbers/);
    await expect(goal(user, { name: "X", target: "0" })).rejects.toThrow(/greater than zero/);
  });

  it("requires unique names (ignoring case and spaces) and a same-currency linked account", async () => {
    const { user, cash } = await setup();
    await goal(user);
    await expect(goal(user, { name: "  emergency   FUND " })).rejects.toThrow(
      /already have a goal/,
    );
    await expect(goal(user, { name: "Trip", accountId: cash })).rejects.toThrow(/uses KHR/);
  });

  it("refuses an archived linked account for new goals", async () => {
    const { user } = await setup();
    const old = (
      await createAccount(user, { name: "Old", type: "BANK", currency: "USD", openingBalance: "0" })
    ).id;
    await archiveAccount(user, old);
    await expect(goal(user, { accountId: old })).rejects.toThrow(/archived/);
  });

  it("fixes the currency once money is set aside and rejects stale edits", async () => {
    const { user } = await setup();
    const { id } = await goal(user);
    const v1 = (await getGoal(user, id)).goal.updatedAt.toISOString();
    await updateGoal(user, {
      id,
      expectedUpdatedAt: v1,
      name: "Emergency fund",
      currency: "KHR",
      target: "4,000,000",
    });
    const v2 = (await getGoal(user, id)).goal.updatedAt.toISOString();
    await put(user, id, "1,000");
    await expect(
      updateGoal(user, {
        id,
        expectedUpdatedAt: v2,
        name: "Emergency fund",
        currency: "USD",
        target: "1000",
      }),
    ).rejects.toThrow(/currency can't change/);
    await expect(
      updateGoal(user, {
        id,
        expectedUpdatedAt: v1,
        name: "Rename",
        currency: "KHR",
        target: "4,000,000",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("double submissions, archive and delete", () => {
  it("records a contribution once per form submission, even when repeated at once", async () => {
    const { user } = await setup();
    const { id } = await goal(user);
    const clientRequestId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => put(user, id, "10", "DEPOSIT", { clientRequestId })),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect((await getGoal(user, id)).goal.savedMinor).toBe(1000n);
  });

  it("archives (no new contributions), restores and deletes with its history", async () => {
    const { user } = await setup();
    const { id } = await goal(user);
    await put(user, id, "10");
    await archiveGoal(user, id);
    expect((await listGoals(user)).archived.map((g) => g.id)).toEqual([id]);
    await expect(put(user, id, "5")).rejects.toThrow(/archived/);
    await restoreGoal(user, id);
    await put(user, id, "5");
    await deleteGoal(user, id);
    expect(await prisma.savingsContribution.count()).toBe(0);
  });
});

describe("earmark warning", () => {
  it("warns when active goals linked to an account earmark more than it holds", async () => {
    const { user, bank } = await setup(); // ABA holds 500.00
    const { id: a } = await goal(user, { accountId: bank, name: "A" });
    const { id: b } = await goal(user, { accountId: bank, name: "B" });
    await put(user, a, "300");
    expect((await listGoals(user)).active.every((g) => g.accountWarning === null)).toBe(true);
    await put(user, b, "250"); // 550 > 500
    const { active } = await listGoals(user);
    expect(active.find((g) => g.id === a)?.accountWarning).toMatch(
      /earmark \$550\.00, but it holds \$500\.00/,
    );
    await archiveGoal(user, b); // archived goals don't count
    expect((await listGoals(user)).active.every((g) => g.accountWarning === null)).toBe(true);
  });
});

describe("isolation", () => {
  it("never shows or changes another user's goals", async () => {
    const alice = await setup();
    const bob = await setup();
    const { id } = await goal(alice.user, { accountId: alice.bank });
    const { id: c } = await put(alice.user, id, "10");
    await expect(getGoal(bob.user, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(put(bob.user, id, "1")).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      deleteContribution(bob.user, { goalId: id, contributionId: c }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveGoal(bob.user, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteGoal(bob.user, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(goal(bob.user, { accountId: alice.bank })).rejects.toBeInstanceOf(ValidationError);
    expect((await listGoals(bob.user)).active).toEqual([]);
    expect((await getGoal(alice.user, id)).goal.savedMinor).toBe(1000n);
  });
});
