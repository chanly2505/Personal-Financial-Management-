import { beforeEach, describe, expect, it } from "vitest";

import { getAccount } from "@/features/accounts/server/service";
import { getBudget } from "@/features/budgets/server/service";
import { getGoal } from "@/features/goals/server/service";
import { getRecurring } from "@/features/recurring/server/service";
import { getRecord } from "@/features/transactions/server/service";
import { isUuid } from "@/lib/ids";
import { NotFoundError } from "@/server/errors";

import { registerTestUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

/** SEC-5: malformed ids from URLs are "not found", never a database error. */

beforeEach(async () => {
  await resetDatabase();
});

describe("record lookups with malformed ids", () => {
  const malformed = ["abc", "1", "' OR 1=1 --", "0190f0c2-xxxx-7000-8000-000000000000", ""];

  it.each(malformed)("%j is not found on every record page", async (id) => {
    const registered = await registerTestUser();
    const user = { id: registered.id, timezone: "Asia/Phnom_Penh" };
    for (const lookup of [
      () => getAccount(user, id),
      () => getRecord(user, id),
      () => getGoal(user, id),
      () => getRecurring(user, id),
      () => getBudget(user, id),
    ]) {
      await expect(lookup()).rejects.toBeInstanceOf(NotFoundError);
    }
  });
});

describe("isUuid", () => {
  it("accepts UUIDs in either case and rejects anything else", () => {
    expect(isUuid("0190f0c2-5b7e-7c3a-9d1e-2f4a6b8c0d1e")).toBe(true);
    expect(isUuid("0190F0C2-5B7E-7C3A-9D1E-2F4A6B8C0D1E")).toBe(true);
    expect(isUuid("0190f0c2-5b7e-7c3a-9d1e-2f4a6b8c0d1e ")).toBe(false);
    expect(isUuid("0190f0c25b7e7c3a9d1e2f4a6b8c0d1e")).toBe(false);
    expect(isUuid("abc")).toBe(false);
  });
});
