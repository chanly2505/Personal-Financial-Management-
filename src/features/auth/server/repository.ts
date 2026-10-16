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

export function findSessionUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      sessionVersion: true,
      timezone: true,
      baseCurrency: true,
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

/** New password + revoke every existing session + consume all reset tokens. */
export function replacePassword(userId: string, passwordHash: string) {
  return prisma.$transaction(async (tx) => {
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
