import { beforeEach, describe, expect, it } from "vitest";

import { changePassword, signOutEverywhere } from "@/features/auth/server/service";
import { resolveSessionUser } from "@/server/auth/session";

import { TEST_PASSWORD, registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

const sessionFor = (user: { id: string; sessionVersion: number }) => ({
  user: { id: user.id, sessionVersion: user.sessionVersion },
});

describe("resolveSessionUser", () => {
  it("returns the user for a current session", async () => {
    const user = await registerTestUser();
    expect(await resolveSessionUser(sessionFor(user))).toMatchObject({
      id: user.id,
      email: user.email,
      timezone: "Asia/Phnom_Penh",
      baseCurrency: "USD",
    });
  });

  it.each([
    ["no session", null],
    ["no user", {}],
    ["missing version", { user: { id: "0190e0a0-0000-7000-8000-000000000000" } }],
    [
      "legacy token (-1)",
      { user: { id: "0190e0a0-0000-7000-8000-000000000000", sessionVersion: -1 } },
    ],
    ["malformed id", { user: { id: "1 OR 1=1", sessionVersion: 0 } }],
  ])("rejects %s", async (_label, session) => {
    expect(await resolveSessionUser(session)).toBeNull();
  });

  it("rejects sessions issued before sign-out-everywhere", async () => {
    const user = await registerTestUser();
    const oldSession = sessionFor(user);
    await signOutEverywhere(user.id);
    expect(await resolveSessionUser(oldSession)).toBeNull();
    expect(
      await resolveSessionUser({ user: { id: user.id, sessionVersion: user.sessionVersion + 1 } }),
    ).not.toBeNull();
  });

  it("rejects sessions issued before a password change", async () => {
    const user = await registerTestUser();
    const oldSession = sessionFor(user);
    await changePassword(user.id, TEST_PASSWORD, "a different password");
    expect(await resolveSessionUser(oldSession)).toBeNull();
  });

  it("rejects sessions of deleted users", async () => {
    const user = await registerTestUser();
    await prisma.user.delete({ where: { id: user.id } });
    expect(await resolveSessionUser(sessionFor(user))).toBeNull();
  });

  it("cannot be pointed at another user by guessing their id with a valid version", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    await signOutEverywhere(bob.id); // bob's version is now 1, alice's 0
    // A token can only be minted by Auth.js with the server secret; even so, the
    // version must match the target user's current version.
    expect(
      await resolveSessionUser({ user: { id: bob.id, sessionVersion: alice.sessionVersion } }),
    ).toBeNull();
  });
});
