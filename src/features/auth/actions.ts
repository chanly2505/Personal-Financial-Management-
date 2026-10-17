"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";

import { safeCallbackPath } from "@/lib/safe-redirect";
import { action } from "@/server/action-result";
import { getClientIp } from "@/server/auth/client-ip";
import { auth, signIn, signOut } from "@/server/auth/config";
import { RateLimitedError, UnauthorizedError } from "@/server/errors";
import { describeError, logger } from "@/server/logger";

import {
  type ForgotPasswordInput,
  type RegisterInput,
  type ResetPasswordInput,
  type SignInInput,
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
  signInSchema,
} from "./schemas";
import { deleteAuthSession } from "./server/repository";
import { registerUser, requestPasswordReset, resetPassword } from "./server/service";

/**
 * Public authentication actions. Each validates on the server, applies rate
 * limits in the service layer, and returns generic messages that never reveal
 * whether an email address is registered.
 */

const INVALID_CREDENTIALS = "Email or password is incorrect.";

async function clientIp() {
  return getClientIp(await headers());
}

/** Exchange credentials for a session cookie via Auth.js. */
async function startSession(email: string, password: string) {
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") {
      if ("code" in error && error.code === "rate_limited") throw new RateLimitedError();
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    throw error;
  }
}

const runSignIn = action(signInSchema, async ({ email, password, callbackUrl }) => {
  await startSession(email, password);
  return { redirectTo: safeCallbackPath(callbackUrl) };
});

export async function signInAction(input: SignInInput) {
  return runSignIn(input);
}

const runRegister = action(registerSchema, async ({ name, email, password }) => {
  await registerUser({ name, email, password }, await clientIp());
  await startSession(email, password);
  return { redirectTo: "/dashboard" };
});

export async function registerAction(input: RegisterInput) {
  return runRegister(input);
}

const runForgotPassword = action(forgotPasswordSchema, async ({ email }) => {
  await requestPasswordReset(email, await clientIp());
});

export async function forgotPasswordAction(input: ForgotPasswordInput) {
  return runForgotPassword(input);
}

const runResetPassword = action(resetPasswordSchema, async ({ token, password }) => {
  await resetPassword(token, password, await clientIp());
});

export async function resetPasswordAction(input: ResetPasswordInput) {
  return runResetPassword(input);
}

/**
 * Form action: end this device's session on the server (a copied cookie stops
 * working too), clear the cookie and return to sign-in.
 */
export async function signOutAction() {
  const session = await auth();
  if (session?.user?.id && session.user.sessionId) {
    await deleteAuthSession(session.user.id, session.user.sessionId).catch((error: unknown) => {
      // The cookie is still cleared; the row expires on its own.
      logger.error("auth.sign_out_failed", describeError(error));
    });
  }
  await signOut({ redirectTo: "/sign-in" });
}
