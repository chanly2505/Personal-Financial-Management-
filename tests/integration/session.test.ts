import { beforeEach, describe, expect, it } from "vitest";

import {
  createAuthSession,
  deleteAuthSession,
  pruneExpiredAuthSessions,
} from "@/features/auth/server/repository";
import { changePassword, signOutEverywhere } from "@/features/auth/server/service";
import { runScheduledJobs } from "@/server/scheduled-jobs";
import { resolveSessionUser } from "@/server/auth/session";

import { TEST_PASSWORD, registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** What Auth.js decodes from a cookie issued at sign-in (a server-side session row is created). */
async function sessionFor(user: { id: string; sessionVersion: number }, expiresAt?: Date) {
  const { id } = await createAuthSession(user.id, expiresAt ?? new Date(Date.now() + WEEK));
  return { user: { id: user.id, sessionVersion: user.sessionVersion, sessionId: id } };
}

describe("resolveSessionUser", () => {
  it("returns the user for a current session", async () => {
    const user = await registerTestUser();
    expect(await resolveSessionUser(await sessionFor(user))).toMatchObject({
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
    [
      "token without a session id (issued before server-side sessions)",
      { user: { id: "0190e0a0-0000-7000-8000-000000000000", sessionVersion: 0 } },
    ],
    [
      "malformed session id",
      {
        user: {
          id: "0190e0a0-0000-7000-8000-000000000000",
          sessionVersion: 0,
          sessionId: "x' OR '1'='1",
        },
      },
    ],
  ])("rejects %s", async (_label, session) => {
    expect(await resolveSessionUser(session)).toBeNull();
  });

  it("rejects sessions issued before sign-out-everywhere", async () => {
    const user = await registerTestUser();
    const oldSession = await sessionFor(user);
    await signOutEverywhere(user.id);
    expect(await resolveSessionUser(oldSession)).toBeNull();
    expect(
      await resolveSessionUser({
        user: { ...oldSession.user, sessionVersion: user.sessionVersion + 1 },
      }),
    ).not.toBeNull();
  });

  it("rejects sessions issued before a password change", async () => {
    const user = await registerTestUser();
    const oldSession = await sessionFor(user);
    await changePassword(user.id, TEST_PASSWORD, "a different password");
    expect(await resolveSessionUser(oldSession)).toBeNull();
  });

  it("rejects sessions of deleted users", async () => {
    const user = await registerTestUser();
    const session = await sessionFor(user);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await resolveSessionUser(session)).toBeNull();
  });

  it("cannot be pointed at another user by guessing their id with a valid version", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    await signOutEverywhere(bob.id); // bob's version is now 1, alice's 0
    // A token can only be minted by Auth.js with the server secret; even so, the
    // version must match the target user's current version.
    const aliceSession = await sessionFor(alice);
    expect(await resolveSessionUser({ user: { ...aliceSession.user, id: bob.id } })).toBeNull();
  });
});

describe("server-side sessions (security review F1, Phase 13)", () => {
  it("signing out ends that session only — a copied cookie stops working, other devices stay", async () => {
    const user = await registerTestUser();
    const laptop = await sessionFor(user);
    const phone = await sessionFor(user);
    await deleteAuthSession(user.id, laptop.user.sessionId);
    expect(await resolveSessionUser(laptop)).toBeNull();
    expect(await resolveSessionUser(phone)).not.toBeNull();
  });

  it("expiry is absolute: a session past its end is refused, whatever the cookie says", async () => {
    const user = await registerTestUser();
    const expired = await sessionFor(user, new Date(Date.now() - 1_000));
    expect(await resolveSessionUser(expired)).toBeNull();
  });

  it("a session id cannot be used with another user's id, or ended by another user", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    const bobSession = await sessionFor(bob);
    expect(await resolveSessionUser({ user: { ...bobSession.user, id: alice.id } })).toBeNull();
    await deleteAuthSession(alice.id, bobSession.user.sessionId);
    expect(await resolveSessionUser(bobSession)).not.toBeNull();
  });

  it("expired sessions are pruned by the scheduled jobs; live ones are kept", async () => {
    const user = await registerTestUser();
    await sessionFor(user, new Date(Date.now() - 1_000));
    const live = await sessionFor(user);
    await runScheduledJobs();
    expect(await prisma.authSession.count({ where: { userId: user.id } })).toBe(1);
    expect(await resolveSessionUser(live)).not.toBeNull();
    expect(await pruneExpiredAuthSessions()).toBe(0);
  });

  it("deleting the account removes its sessions", async () => {
    const user = await registerTestUser();
    await sessionFor(user);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.authSession.count({ where: { userId: user.id } })).toBe(0);
  });
});
