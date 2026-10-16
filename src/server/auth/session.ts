import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { findSessionUser } from "@/features/auth/server/repository";
import type { CurrencyCode } from "@/lib/money";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { UnauthorizedError } from "@/server/errors";

import { auth } from "./config";

/**
 * The single source of "who is making this request". Every protected page,
 * server action and route handler goes through these helpers — never through
 * a user id supplied by the client.
 */
export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  baseCurrency: CurrencyCode;
}

interface SessionLike {
  user?: { id?: string; sessionVersion?: number } | null;
}

/**
 * Turn a decoded session into a verified user: the user must still exist and
 * the token's session version must match the database. A mismatch means the
 * user signed out everywhere or changed their password after this token was
 * issued. Exported for tests; application code uses getCurrentUser().
 */
export async function resolveSessionUser(
  session: SessionLike | null | undefined,
): Promise<CurrentUser | null> {
  const id = session?.user?.id;
  const version = session?.user?.sessionVersion;
  if (typeof id !== "string" || typeof version !== "number" || version < 0) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const user = await findSessionUser(id);
  if (!user || user.sessionVersion !== version) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    baseCurrency: user.baseCurrency,
  };
}

/** Verified current user or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  return resolveSessionUser(await auth());
});

/** For server actions, route handlers and services: throws UnauthorizedError. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** For pages and layouts: redirects to sign-in, returning here afterwards. */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) return user;
  const path = (await headers()).get("x-pathname");
  const callbackUrl = safeCallbackPath(path);
  redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}
