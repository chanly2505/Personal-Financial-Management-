"use server";

import { cookies } from "next/headers";

import { THEMES, THEME_COOKIE, THEME_COOKIE_MAX_AGE, type ThemePreference } from "@/lib/theme";

/**
 * Remember the colour theme for this browser. Not tied to the account and
 * holds no personal data, so it needs no session; unknown values are refused.
 */
export async function setThemeAction(theme: ThemePreference): Promise<{ ok: boolean }> {
  if (!THEMES.includes(theme)) return { ok: false };
  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true };
}
