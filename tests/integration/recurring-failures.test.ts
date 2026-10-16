import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Failure handling: a rule whose posting fails is recorded (safe reason code,
 * attempt count), retried on the next run without double-posting, and paused
 * after MAX_ATTEMPTS. The repository's processRule is wrapped so a test can
 * make it fail; everything else is real.
 */
const failing = vi.hoisted(() => ({ ids: new Set<string>() }));

vi.mock("@/features/recurring/server/repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/recurring/server/repository")>();
  return {
    ...original,
    processRule: async (...args: Parameters<typeof original.processRule>) => {
      if (failing.ids.has(args[0])) {
        throw Object.assign(new Error("connection reset while inserting amount 300 for Rent"), {
          code: "P1017",
        });
      }
      return original.processRule(...args);
    },
  };
});

const { createAccount } = await import("@/features/accounts/server/service");
const { createRecurring, getRecurring, listRecurring, runDueRules } =
  await import("@/features/recurring/server/service");

const at = (date: string) => new Date(`${date}T05:00:00Z`);

async function setup() {
  const user = { id: (await registerTestUser()).id, timezone: "Asia/Phnom_Penh" };
  const bank = (
    await createAccount(user, { name: "ABA", type: "BANK", currency: "USD", openingBalance: "0" })
  ).id;
  const rent = (
    await prisma.category.findFirstOrThrow({ where: { userId: user.id, name: "Housing and rent" } })
  ).id;
  const { id } = await createRecurring(user, {
    name: "Rent",
    type: "EXPENSE",
    accountId: bank,
    categoryId: rent,
    amount: "300",
    frequency: "MONTHLY",
    interval: 1,
    startOn: "2026-01-31",
    catchUp: true,
  });
  return { user, id };
}

beforeEach(async () => {
  await resetDatabase();
  failing.ids.clear();
});

describe("failures and retries", () => {
  it("records a safe reason, retries next run, and posts exactly once after recovery", async () => {
    const { user, id } = await setup();
    failing.ids.add(id);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runDueRules({ now: at("2026-02-01") })).toMatchObject({ failed: 1, posted: 0 });
    const logged = errors.mock.calls.map((c) => String(c[0])).join("");
    errors.mockRestore();
    // Logs carry ids and the error class, never amounts or names.
    expect(logged).toContain("recurring.rule_failed");
    expect(logged).not.toContain("Rent");
    expect(logged).not.toContain("300");

    let run = await prisma.recurringRun.findFirstOrThrow({ where: { ruleId: id } });
    expect(run).toMatchObject({ status: "FAILED", reason: "database_error", attempts: 1 });
    expect((await listRecurring(user)).failures).toHaveLength(1);

    await runDueRules({ now: at("2026-02-01") });
    run = await prisma.recurringRun.findFirstOrThrow({ where: { ruleId: id } });
    expect(run.attempts).toBe(2);
    expect(await prisma.transaction.count()).toBe(0);

    failing.ids.delete(id);
    expect(await runDueRules({ now: at("2026-02-01") })).toMatchObject({ posted: 1, failed: 0 });
    await runDueRules({ now: at("2026-02-01") });
    expect(await prisma.transaction.count()).toBe(1);
    run = await prisma.recurringRun.findFirstOrThrow({ where: { ruleId: id } });
    expect(run).toMatchObject({ status: "POSTED", reason: null, attempts: 3 });
    expect((await listRecurring(user)).failures).toHaveLength(0);
  });

  it("pauses the rule after repeated failures so the user can act", async () => {
    const { user, id } = await setup();
    failing.ids.add(id);
    for (let i = 0; i < 5; i += 1) await runDueRules({ now: at("2026-02-01") });
    const { rule, runs } = await getRecurring(user, id);
    expect(rule).toMatchObject({ status: "PAUSED", pauseReason: "REPEATED_FAILURES" });
    expect(runs[0]).toMatchObject({ status: "FAILED", attempts: 5 });
    // Paused: further runs do nothing.
    expect(await runDueRules({ now: at("2026-02-01") })).toMatchObject({ rules: 0 });
  });

  it("one failing rule does not stop the others", async () => {
    const a = await setup();
    const b = await setup();
    failing.ids.add(a.id);
    const summary = await runDueRules({ now: at("2026-02-01") });
    expect(summary).toMatchObject({ rules: 2, failed: 1, posted: 1 });
    expect(await prisma.transaction.count({ where: { recurringRuleId: b.id } })).toBe(1);
  });
});
