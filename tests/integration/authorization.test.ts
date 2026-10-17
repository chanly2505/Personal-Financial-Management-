import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/server/auth/session";

import { TEST_PASSWORD, registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Server actions and route handlers must authorise from the verified session
 * only. The session lookup is replaced by a test double so each test can act
 * as a chosen user (or as nobody); everything below it — validation, services,
 * repositories, the database — is real.
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
// Next.js request-scoped APIs are not available outside a request.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/config", () => ({
  signOut: vi.fn(async () => undefined),
  signIn: vi.fn(),
  auth: vi.fn(),
  handlers: {},
}));

const { updateProfileAction, updatePreferencesAction, deleteAccountAction, changePasswordAction } =
  await import("@/features/settings/actions");
const { GET: getMe } = await import("@/app/api/me/route");

async function actAs(user: { id: string; email: string } | null) {
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

const validProfile = { name: "Updated" };
const validPreferences = {
  baseCurrency: "KHR" as const,
  timezone: "Asia/Bangkok",
  dateFormat: "ISO" as const,
  numberFormat: "DOT_COMMA" as const,
  currencyDisplay: "CODE" as const,
};

beforeEach(async () => {
  await resetDatabase();
  session.current = null;
});

describe("missing or invalid authorization", () => {
  it("rejects anonymous server actions before validating or touching data", async () => {
    const victim = await registerTestUser();
    await actAs(null);

    const result = await updateProfileAction({ ...validProfile, name: "x".repeat(500) });
    // UNAUTHORIZED, not a validation error: anonymous callers learn nothing.
    expect(result).toEqual({
      ok: false,
      code: "UNAUTHORIZED",
      error: "Please sign in to continue.",
    });

    const del = await deleteAccountAction({ password: TEST_PASSWORD, confirmation: "DELETE" });
    expect(del).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(await prisma.user.count({ where: { id: victim.id } })).toBe(1);
  });

  it("returns a consistent 401 JSON body from protected route handlers", async () => {
    await actAs(null);
    const response = await getMe(new Request("http://localhost/api/me"), {});
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Please sign in to continue." },
    });
  });

  it("returns only the caller's own data from /api/me", async () => {
    const alice = await registerTestUser();
    await registerTestUser();
    await actAs(alice);
    const response = await getMe(new Request("http://localhost/api/me?id=someone-else"), {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: alice.id, email: alice.email });
  });
});

describe("user A cannot read or modify user B's data", () => {
  it("ignores a client-supplied userId and updates only the session user's profile", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    await actAs(alice);

    const result = await updateProfileAction({
      ...validProfile,
      // @ts-expect-error — not part of the schema; must be stripped, never trusted
      userId: bob.id,
    });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(
      await updatePreferencesAction({
        ...validPreferences,
        // @ts-expect-error — not part of the schema; must be stripped, never trusted
        userId: bob.id,
      }),
    ).toEqual({ ok: true, data: undefined });

    const [a, b] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: alice.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: bob.id } }),
    ]);
    expect(a.name).toBe("Updated");
    expect(a.baseCurrency).toBe("KHR");
    expect(b.name).toBe(bob.name);
    expect(b.baseCurrency).toBe("USD");
  });

  it("cannot delete another user's account, even knowing their password", async () => {
    const alice = await registerTestUser({ password: "alice password 1" });
    const bob = await registerTestUser({ password: "bob password 123" });
    await actAs(alice);

    // Bob's password is checked against Alice (the session user) and fails.
    const result = await deleteAccountAction({
      password: "bob password 123",
      confirmation: "DELETE",
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await prisma.user.count({ where: { id: bob.id } })).toBe(1);
    expect(await prisma.user.count({ where: { id: alice.id } })).toBe(1);
  });

  it("cannot change another user's password", async () => {
    const alice = await registerTestUser({ password: "alice password 1" });
    const bob = await registerTestUser({ password: "bob password 123" });
    await actAs(alice);

    const result = await changePasswordAction({
      currentPassword: "bob password 123",
      newPassword: "taken over 12345",
      confirmPassword: "taken over 12345",
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    const bobRow = await prisma.user.findUniqueOrThrow({ where: { id: bob.id } });
    expect(bobRow.sessionVersion).toBe(bob.sessionVersion);
  });

  it("database rejects linking B's account to A's records (defence in depth)", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    const bobsAccount = await prisma.financialAccount.create({
      data: { userId: bob.id, name: "Bob wallet", type: "CASH", currency: "USD" },
    });
    const alicesCategory = await prisma.category.findFirstOrThrow({
      where: { userId: alice.id, type: "EXPENSE" },
    });
    await expect(
      prisma.transaction.create({
        data: {
          userId: alice.id,
          accountId: bobsAccount.id,
          categoryId: alicesCategory.id,
          type: "EXPENSE",
          amountMinor: 100n,
          occurredOn: new Date("2026-10-16T00:00:00Z"),
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/i);
  });
});

describe("validation on the server", () => {
  it("re-validates profile input even from an authenticated user", async () => {
    const alice = await registerTestUser();
    await actAs(alice);
    const result = await updatePreferencesAction({
      ...validPreferences,
      timezone: "Mars/Olympus",
      // @ts-expect-error — not an allowed value
      dateFormat: "YYYYMMDD",
    });
    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: {
        timezone: "Choose a valid timezone.",
        dateFormat: expect.any(String),
      },
    });
  });
});
