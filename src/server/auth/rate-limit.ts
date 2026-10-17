import "server-only";
import { createHash } from "node:crypto";

import { prisma } from "@/server/db";
import { env } from "@/server/env";

/**
 * Fixed-window rate limiting backed by PostgreSQL, so limits hold across
 * multiple server instances. Keys are SHA-256 hashes: raw emails and IP
 * addresses are never stored (docs/SECURITY.md §3).
 */
export interface RateLimitRule {
  /** Short scope name, e.g. "signin:email". */
  scope: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  signInPerEmail: { scope: "signin:email", limit: 5, windowSeconds: 15 * 60 },
  signInPerIp: { scope: "signin:ip", limit: 20, windowSeconds: 15 * 60 },
  registerPerIp: { scope: "register:ip", limit: 5, windowSeconds: 60 * 60 },
  /**
   * When the client IP is unknown (TRUSTED_IP_HEADER unset) all registrations
   * share one budget, so sign-ups can't be used to burn CPU on password hashing
   * or fill the database without limit (QA-12).
   */
  registerWithoutIp: {
    scope: "register:no-ip",
    limit: env.REGISTRATION_LIMIT_WITHOUT_IP,
    windowSeconds: 60 * 60,
  },
  resetRequestPerEmail: { scope: "reset-request:email", limit: 3, windowSeconds: 60 * 60 },
  resetRequestPerIp: { scope: "reset-request:ip", limit: 10, windowSeconds: 60 * 60 },
  resetSubmitPerIp: { scope: "reset-submit:ip", limit: 10, windowSeconds: 60 * 60 },
  passwordCheckPerUser: { scope: "password-check:user", limit: 5, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function keyFor(rule: RateLimitRule, subject: string): string {
  return createHash("sha256").update(`${rule.scope}:${subject.toLowerCase()}`).digest("hex");
}

/**
 * Count one attempt for `subject` and report whether it is within the limit.
 * A single atomic upsert, so concurrent attempts cannot slip past the limit.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const key = keyFor(rule, subject);
  const rows = await prisma.$queryRaw<{ count: number; reset_at: Date }[]>`
    INSERT INTO auth_rate_limits (key, count, reset_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${rule.windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_rate_limits.reset_at <= now() THEN 1 ELSE auth_rate_limits.count + 1 END,
      reset_at = CASE WHEN auth_rate_limits.reset_at <= now()
                      THEN now() + make_interval(secs => ${rule.windowSeconds})
                      ELSE auth_rate_limits.reset_at END
    RETURNING count, reset_at`;
  const row = rows[0];
  if (!row) throw new Error("Rate limit upsert returned no row");
  const retryAfterSeconds = Math.max(0, Math.ceil((row.reset_at.getTime() - Date.now()) / 1000));
  return {
    allowed: row.count <= rule.limit,
    remaining: Math.max(0, rule.limit - row.count),
    retryAfterSeconds,
  };
}

/** Forget previous attempts, e.g. after a successful sign-in. */
export async function resetRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  await prisma.authRateLimit.deleteMany({ where: { key: keyFor(rule, subject) } });
}

/** Housekeeping: drop windows that ended more than a day ago. */
export async function pruneRateLimits(): Promise<number> {
  const { count } = await prisma.authRateLimit.deleteMany({
    where: { resetAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return count;
}
