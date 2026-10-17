import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { signInSchema } from "@/features/auth/schemas";
import { createAuthSession } from "@/features/auth/server/repository";
import { authenticate } from "@/features/auth/server/service";
import { env } from "@/server/env";
import { RateLimitedError } from "@/server/errors";
import { describeError, logger } from "@/server/logger";

import { getClientIp } from "./client-ip";

/** Session lifetime: 7 days from sign-in, absolute (auth_sessions.expires_at). */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/** Lets the sign-in action tell "rate limited" apart from "wrong credentials". */
export class RateLimitedSignin extends CredentialsSignin {
  override code = "rate_limited";
}

/**
 * Auth.js (ADR-1): Credentials provider + encrypted JWT session cookie.
 *
 * - Credentials are verified by features/auth (argon2id, rate limits, timing
 *   equalisation). Because rate limiting happens inside `authorize`, it also
 *   covers direct POSTs to /api/auth/callback/credentials.
 * - The token carries only the user id and session version. Every request
 *   re-checks the version against the database (server/auth/session.ts), which
 *   is how sign-out-everywhere and password changes revoke old cookies.
 * - Cookies: HttpOnly, SameSite=Lax, and Secure + "__Secure-" prefix whenever
 *   the app is served over HTTPS (Auth.js defaults, derived from AUTH_URL /
 *   X-Forwarded-Proto). Set AUTH_URL to the https:// origin in production.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;
        try {
          const user = await authenticate(
            parsed.data.email,
            parsed.data.password,
            getClientIp(request.headers),
          );
          if (!user) return null;
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            sessionVersion: user.sessionVersion,
          };
        } catch (error) {
          if (error instanceof RateLimitedError) throw new RateLimitedSignin();
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
        token.sub = user.id;
        token.sv = user.sessionVersion ?? 0;
        token.sid = (await createAuthSession(user.id, expiresAt)).id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (typeof token.sid === "string") session.user.sessionId = token.sid;
      session.user.sessionVersion = typeof token.sv === "number" ? token.sv : -1;
      return session;
    },
  },
  logger: {
    error(error) {
      // CredentialsSignin is an expected outcome (wrong password), not a server error.
      if (error.name === "CredentialsSignin") return;
      // Auth.js error classes are renamed by minification; `type` survives.
      const type = (error as { type?: string }).type;
      logger.error("auth.error", {
        ...describeError(error),
        ...(type && { errorType: type }),
        ...(type === "UntrustedHost" && {
          hint: "Set AUTH_URL to the address the app is served from (e.g. http://localhost:3000), or AUTH_TRUST_HOST=true behind a trusted proxy. Sign-in cannot work until then.",
        }),
      });
    },
    warn(code) {
      logger.warn("auth.warning", { code });
    },
    debug() {},
  },
});
