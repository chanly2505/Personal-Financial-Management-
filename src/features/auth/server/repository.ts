import "server-only";

import { DEFAULT_CATEGORIES } from "@/features/categories/default-categories";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

/**
 * Data access for identity and credentials. Every function that touches an
 * existing user takes the user's id (from the session or a verified token) —
 * never an id supplied by the client.
 */

const credentialSelect = {
  id: true,
  email: true,
  name: true,
  passwordHash: true,
  sessionVersion: true,
} as const;

export function findUserCredentialsByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: credentialSelect });
}

export function findUserCredentialsById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: credentialSelect });
}

/** Start a server-side session (one per sign-in) that ends at `expiresAt` at the latest. */
export function createAuthSession(userId: string, expiresAt: Date) {
  return prisma.authSession.create({ data: { userId, expiresAt }, select: { id: true } });
}

/** End one session — signing out on this device only. */
export function deleteAuthSession(userId: string, sessionId: string) {
  return prisma.authSession.deleteMany({ where: { id: sessionId, userId } });
}

/** Remove sessions past their absolute expiry (scheduled housekeeping). */
export async function pruneExpiredAuthSessions(): Promise<number> {
  const { count } = await prisma.authSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

/** The user behind a session — only while that session exists and has not expired. */
export function findSessionUser(userId: string, sessionId: string) {
  return prisma.user.findFirst({
    where: { id: userId, sessions: { some: { id: sessionId, expiresAt: { gt: new Date() } } } },
    select: {
      id: true,
      email: true,
      name: true,
      sessionVersion: true,
      timezone: true,
      baseCurrency: true,
      dateFormat: true,
      numberFormat: true,
      currencyDisplay: true,
    },
  });
}

/**
 * Create the user and their default categories atomically.
 * Returns null if the email is already taken (including a concurrent registration).
 */
export async function createUserWithDefaults(data: {
  email: string;
  name?: string;
  passwordHash: string;
}) {
  try {
    return await createUserTransaction(data);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }
}

function createUserTransaction(data: { email: string; name?: string; passwordHash: string }) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: data.email, name: data.name ?? null, passwordHash: data.passwordHash },
      select: { id: true, email: true, name: true, sessionVersion: true },
    });
    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })),
    });
    return user;
  });
}

/**
 * New password + revoke every existing session + consume all reset tokens.
 * With `consumeTokenHash`, the change only happens if that unexpired token is
 * still there (deleted atomically here); otherwise returns null.
 */
export function replacePassword(
  userId: string,
  passwordHash: string,
  options: { consumeTokenHash?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    if (options.consumeTokenHash) {
      const { count } = await tx.passwordResetToken.deleteMany({
        where: { userId, tokenHash: options.consumeTokenHash, expiresAt: { gt: new Date() } },
      });
      if (count !== 1) return null;
    }
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    return tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
      select: { id: true, sessionVersion: true },
    });
  });
}

/** Re-hash with current parameters; not a credential change, so sessions stay valid. */
export async function updatePasswordHash(userId: string, passwordHash: string) {
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export function incrementSessionVersion(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { id: true, sessionVersion: true },
  });
}

/** Deletes the user and — via ON DELETE CASCADE — every row they own. */
export async function deleteUser(userId: string) {
  await prisma.user.delete({ where: { id: userId } });
}

/** Replace any outstanding reset tokens for the user with a new one. */
export function storeResetToken(userId: string, tokenHash: string, expiresAt: Date) {
  return prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } }),
  ]);
}

export function findResetToken(tokenHash: string) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { userId: true, expiresAt: true, user: { select: { email: true } } },
  });
}
