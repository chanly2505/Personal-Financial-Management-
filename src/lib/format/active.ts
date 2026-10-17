import { DEFAULT_FORMAT_PREFS, type FormatPrefs } from "./preferences";

/**
 * Where formatters find the current user's display preferences when they are
 * not passed explicitly.
 *
 * - Server components: src/server/format-context.ts registers a resolver backed
 *   by a per-request React cache, filled when the session user is loaded. Each
 *   request sees only its own user's preferences.
 * - Client components must NOT rely on this (the server-side rendering pass of
 *   client components is shared between requests): they read the preferences
 *   from React context with useFormatPrefs() and pass them explicitly.
 * - Anywhere else (route handlers, scripts, tests): the defaults.
 */
let resolver: () => FormatPrefs = () => DEFAULT_FORMAT_PREFS;

export function setFormatPrefsResolver(next: () => FormatPrefs): void {
  resolver = next;
}

export function activeFormatPrefs(): FormatPrefs {
  return resolver();
}
