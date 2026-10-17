import "server-only";
import { createHash, randomBytes } from "node:crypto";

import {
  hashPassword,
  needsRehash,
  verifyDummyPassword,
  verifyPassword,
} from "@/server/auth/password";
import { RATE_LIMITS, consumeRateLimit, resetRateLimit } from "@/server/auth/rate-limit";
import { passwordRecoveryEnabled } from "@/server/env";
import { ConflictError, RateLimitedError, ValidationError } from "@/server/errors";
import { describeError, logger } from "@/server/logger";
import { appUrl, getMailer } from "@/server/mail";

import * as repo from "./repository";

/**
 * Authentication business rules. Inputs are already validated by the
 * features/auth/schemas.ts schemas (emails normalised to lower case).
 * Error messages are deliberately generic: they never reveal whether an email
 * is registered (docs/SECURITY.md §2).
 */

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  sessionVersion: number;
}

const REGISTRATION_CONFLICT =
  "We couldn't create an account with these details. If you already have an account, sign in or reset your password.";
const INVALID_RESET = "This reset link is invalid or has expired. Please request a new one.";

async function enforce(rule: Parameters<typeof consumeRateLimit>[0], subject: string | undefined) {
  if (!subject) return;
  const result = await consumeRateLimit(rule, subject);
  if (!result.allowed) {
    logger.warn("auth.rate_limited", { scope: rule.scope });
    throw new RateLimitedError();
  }
}

/**
 * Check an email/password pair. Returns null for any wrong combination.
 * Throws RateLimitedError when too many attempts were made for this email or IP.
 */
export async function authenticate(
  email: string,
  password: string,
  ip?: string,
): Promise<AuthenticatedUser | null> {
  await enforce(RATE_LIMITS.signInPerIp, ip);
  await enforce(RATE_LIMITS.signInPerEmail, email);

  const user = await repo.findUserCredentialsByEmail(email);
  if (!user) return verifyDummyPassword(password).then(() => null);

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) return null;

  await resetRateLimit(RATE_LIMITS.signInPerEmail, email);
  if (needsRehash(user.passwordHash)) {
    // Transparent upgrade when hashing parameters are raised. Not a credential change,
    // so sessions stay valid.
    await upgradeHash(user.id, password);
  }
  return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
}

async function upgradeHash(userId: string, password: string) {
  try {
    await repo.updatePasswordHash(userId, await hashPassword(password));
  } catch (error) {
    logger.warn("auth.rehash_failed", describeError(error));
  }
}

export async function registerUser(
  input: { name?: string; email: string; password: string },
  ip?: string,
): Promise<AuthenticatedUser> {
  if (ip) await enforce(RATE_LIMITS.registerPerIp, ip);
  else await enforce(RATE_LIMITS.registerWithoutIp, "all");

  const existing = await repo.findUserCredentialsByEmail(input.email);
  if (existing) throw new ConflictError(REGISTRATION_CONFLICT);

  const passwordHash = await hashPassword(input.password);
  const user = await repo.createUserWithDefaults({ ...input, passwordHash });
  if (!user) throw new ConflictError(REGISTRATION_CONFLICT); // lost a race for the same email
  logger.info("auth.registered");
  return user;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Start password recovery. Always completes the same way whether or not the
 * email is registered; only registered users actually receive a link.
 */
export async function requestPasswordReset(email: string, ip?: string): Promise<void> {
  if (!passwordRecoveryEnabled) return;
  await enforce(RATE_LIMITS.resetRequestPerIp, ip);

  const perEmail = await consumeRateLimit(RATE_LIMITS.resetRequestPerEmail, email);
  if (!perEmail.allowed) return; // silently: do not reveal anything about the address

  const user = await repo.findUserCredentialsByEmail(email);
  if (!user) return;

  const token = randomBytes(32).toString("base64url");
  await repo.storeResetToken(user.id, hashToken(token), new Date(Date.now() + RESET_TOKEN_TTL_MS));

  const link = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  await getMailer().send({
    to: user.email,
    subject: "Reset your password",
    text:
      `Someone (hopefully you) asked to reset the password for your Personal Finance account.\n\n` +
      `Reset it here within 30 minutes:\n${link}\n\n` +
      `If you didn't ask for this, you can ignore this email — your password won't change.`,
  });
  logger.info("auth.reset_requested");
}

/** Finish password recovery. Single use; revokes every existing session. */
export async function resetPassword(token: string, newPassword: string, ip?: string) {
  await enforce(RATE_LIMITS.resetSubmitPerIp, ip);

  const tokenHash = hashToken(token);
  const record = await repo.findResetToken(tokenHash);
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw new ValidationError(INVALID_RESET, { token: INVALID_RESET });
  }

  // The token is consumed in the same transaction as the password change, so
  // two submissions racing with one link can't both succeed (QA-14).
  const changed = await repo.replacePassword(record.userId, await hashPassword(newPassword), {
    consumeTokenHash: tokenHash,
  });
  if (!changed) throw new ValidationError(INVALID_RESET, { token: INVALID_RESET });
  await resetRateLimit(RATE_LIMITS.signInPerEmail, record.user.email);
  logger.info("auth.password_reset");
}

/** Re-check the current password for sensitive actions; limited per user. */
async function confirmPassword(userId: string, password: string, field: string) {
  await enforce(RATE_LIMITS.passwordCheckPerUser, userId);
  const user = await repo.findUserCredentialsById(userId);
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new ValidationError("Your current password is incorrect.", {
      [field]: "Your current password is incorrect.",
    });
  }
  await resetRateLimit(RATE_LIMITS.passwordCheckPerUser, userId);
  return user;
}

/** Change password; every session — including this one — must sign in again. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  await confirmPassword(userId, currentPassword, "currentPassword");
  await repo.replacePassword(userId, await hashPassword(newPassword));
  logger.info("auth.password_changed");
}

export async function signOutEverywhere(userId: string) {
  await repo.incrementSessionVersion(userId);
  logger.info("auth.signed_out_everywhere");
}

/** Permanently delete the user and all of their data. */
export async function deleteAccount(userId: string, password: string) {
  await confirmPassword(userId, password, "password");
  await repo.deleteUser(userId);
  logger.info("auth.account_deleted");
}

export { repo as authRepository };
