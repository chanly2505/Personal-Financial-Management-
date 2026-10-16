import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RESET_TOKEN_TTL_MS,
  authenticate,
  changePassword,
  deleteAccount,
  registerUser,
  requestPasswordReset,
  resetPassword,
  signOutEverywhere,
} from "@/features/auth/server/service";
import { ConflictError, RateLimitedError, ValidationError } from "@/server/errors";
import { type MailMessage, setMailerForTesting } from "@/server/mail";

import { TEST_PASSWORD, registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

let outbox: MailMessage[] = [];

beforeEach(async () => {
  await resetDatabase();
  outbox = [];
  setMailerForTesting({ send: async (m) => void outbox.push(m) });
});

afterEach(() => setMailerForTesting(undefined));

function tokenFrom(message: MailMessage | undefined): string {
  const match = message?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error("No reset token in email");
  return match[1];
}

describe("registration", () => {
  it("stores an argon2id hash, never the password, and seeds default categories", async () => {
    const user = await registerTestUser();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(row.passwordHash).not.toContain(TEST_PASSWORD);
    expect(await prisma.category.count({ where: { userId: user.id } })).toBeGreaterThan(5);
  });

  it("rejects a taken email with a generic message", async () => {
    const user = await registerTestUser();
    const attempt = registerUser({ email: user.email, password: "another password 123" });
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toThrow(/couldn't create an account with these details/);
  });

  it("limits registrations per IP", async () => {
    for (let i = 0; i < 5; i++) {
      await registerUser({ email: `ip${i}@example.test`, password: TEST_PASSWORD }, "203.0.113.9");
    }
    await expect(
      registerUser({ email: "ip6@example.test", password: TEST_PASSWORD }, "203.0.113.9"),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("sign-in", () => {
  it("accepts the right password and rejects wrong passwords and unknown emails alike", async () => {
    const user = await registerTestUser();
    expect(await authenticate(user.email, TEST_PASSWORD)).toMatchObject({
      id: user.id,
      email: user.email,
    });
    expect(await authenticate(user.email, "wrong password!!")).toBeNull();
    expect(await authenticate("nobody@example.test", TEST_PASSWORD)).toBeNull();
  });

  it("locks an email after 5 failed attempts, even for the right password", async () => {
    const user = await registerTestUser();
    for (let i = 0; i < 5; i++) await authenticate(user.email, "wrong password!!");
    await expect(authenticate(user.email, TEST_PASSWORD)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("resets the failure counter after a successful sign-in", async () => {
    const user = await registerTestUser();
    for (let i = 0; i < 4; i++) await authenticate(user.email, "wrong password!!");
    expect(await authenticate(user.email, TEST_PASSWORD)).not.toBeNull();
    for (let i = 0; i < 4; i++) await authenticate(user.email, "wrong password!!");
    expect(await authenticate(user.email, TEST_PASSWORD)).not.toBeNull();
  });

  it("limits attempts per IP across different emails", async () => {
    for (let i = 0; i < 20; i++) await authenticate(`spray${i}@example.test`, "x", "198.51.100.7");
    await expect(
      authenticate("spray-final@example.test", "x", "198.51.100.7"),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("stores only hashed rate-limit keys", async () => {
    await authenticate("someone@example.test", "x", "198.51.100.8");
    const keys = await prisma.authRateLimit.findMany();
    expect(keys.length).toBeGreaterThan(0);
    for (const { key } of keys) {
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(key).not.toContain("someone");
    }
  });
});

describe("password recovery", () => {
  it("emails a single-use link to registered users and stores only its hash", async () => {
    const user = await registerTestUser();
    await requestPasswordReset(user.email);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe(user.email);
    const token = tokenFrom(outbox[0]);

    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    await resetPassword(token, "a brand new password");
    expect(await authenticate(user.email, TEST_PASSWORD)).toBeNull();
    expect(await authenticate(user.email, "a brand new password")).not.toBeNull();

    await expect(resetPassword(token, "yet another password")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("behaves identically for unknown emails (no email, no error)", async () => {
    await expect(requestPasswordReset("nobody@example.test")).resolves.toBeUndefined();
    expect(outbox).toHaveLength(0);
  });

  it("rejects expired and made-up tokens", async () => {
    const user = await registerTestUser();
    await requestPasswordReset(user.email);
    const token = tokenFrom(outbox[0]);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(resetPassword(token, "a brand new password")).rejects.toThrow(
      /invalid or has expired/,
    );
    await expect(resetPassword("x".repeat(43), "a brand new password")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(RESET_TOKEN_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("revokes existing sessions when the password is reset", async () => {
    const user = await registerTestUser();
    await requestPasswordReset(user.email);
    await resetPassword(tokenFrom(outbox[0]), "a brand new password");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.sessionVersion).toBe(user.sessionVersion + 1);
  });

  it("only lets one user's token reset that user's password", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    await requestPasswordReset(alice.email);
    await resetPassword(tokenFrom(outbox[0]), "alice new password");
    expect(await authenticate(bob.email, TEST_PASSWORD)).not.toBeNull();
  });
});

describe("account security", () => {
  it("requires the current password to change it, then revokes sessions", async () => {
    const user = await registerTestUser();
    await expect(changePassword(user.id, "not my password", "new password 123")).rejects.toThrow(
      /current password is incorrect/,
    );
    await changePassword(user.id, TEST_PASSWORD, "new password 123");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.sessionVersion).toBe(user.sessionVersion + 1);
    expect(await authenticate(user.email, "new password 123")).not.toBeNull();
  });

  it("limits current-password guesses per user", async () => {
    const user = await registerTestUser();
    for (let i = 0; i < 5; i++) {
      await expect(changePassword(user.id, "guess", "new password 123")).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    await expect(changePassword(user.id, TEST_PASSWORD, "new password 123")).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it("sign out everywhere bumps only that user's session version", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    await signOutEverywhere(alice.id);
    const [a, b] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: alice.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: bob.id } }),
    ]);
    expect(a.sessionVersion).toBe(alice.sessionVersion + 1);
    expect(b.sessionVersion).toBe(bob.sessionVersion);
  });

  it("deletes the account and all of its data — and nobody else's", async () => {
    const alice = await registerTestUser();
    const bob = await registerTestUser();
    await expect(deleteAccount(alice.id, "wrong password")).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.user.count({ where: { id: alice.id } })).toBe(1);

    await deleteAccount(alice.id, TEST_PASSWORD);
    expect(await prisma.user.count({ where: { id: alice.id } })).toBe(0);
    expect(await prisma.category.count({ where: { userId: alice.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: bob.id } })).toBe(1);
    expect(await prisma.category.count({ where: { userId: bob.id } })).toBeGreaterThan(0);
  });
});
