import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { findSessionUser } from "@/features/auth/server/repository";
import type { FormatPrefs } from "@/lib/format/preferences";
import type { CurrencyCode } from "@/lib/money";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { UnauthorizedError } from "@/server/errors";
import { setRequestFormatPrefs } from "@/server/format-context";

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
  /** Display preferences. Always set for session users; test doubles may omit it. */
  formatPrefs?: FormatPrefs;
}

interface SessionLike {
  user?: { id?: string; sessionVersion?: number; sessionId?: string } | null;
}

/**
 * Turn a decoded session into a verified user: the user must still exist, the
 * server-side session row must exist and be unexpired (signing out deletes it;
 * its expiry is absolute), and the token's session version must match the
 * database. A version mismatch means the user signed out everywhere or changed
 * their password after this token was issued. Exported for tests; application code uses getCurrentUser().
 */
export async function resolveSessionUser(
  session: SessionLike | null | undefined,
): Promise<CurrentUser | null> {
  const id = session?.user?.id;
  const version = session?.user?.sessionVersion;
  if (typeof id !== "string" || typeof version !== "number" || version < 0) return null;
  const sessionId = session?.user?.sessionId;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) return null;

  const user = await findSessionUser(id, sessionId);
  if (!user || user.sessionVersion !== version) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    baseCurrency: user.baseCurrency,
    formatPrefs: {
      dateFormat: user.dateFormat,
      numberFormat: user.numberFormat,
      currencyDisplay: user.currencyDisplay,
    },
  };
}

/** Verified current user or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await resolveSessionUser(await auth());
  // Every amount and date this request renders on the server uses these.
  if (user?.formatPrefs) setRequestFormatPrefs(user.formatPrefs);
  return user;
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
