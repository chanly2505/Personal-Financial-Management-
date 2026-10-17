import "server-only";
import { cache } from "react";

import { setFormatPrefsResolver } from "@/lib/format/active";
import { DEFAULT_FORMAT_PREFS, type FormatPrefs } from "@/lib/format/preferences";

/**
 * Per-request display preferences for server components. React's cache() is
 * scoped to one server render, so concurrent requests from different users
 * never see each other's preferences. Outside a render (route handlers,
 * scripts) each call gets a fresh store, i.e. the defaults.
 */
const store = cache((): { prefs: FormatPrefs } => ({ prefs: DEFAULT_FORMAT_PREFS }));

setFormatPrefsResolver(() => store().prefs);

/** Called when the session user is loaded (src/server/auth/session.ts). */
export function setRequestFormatPrefs(prefs: FormatPrefs): void {
  store().prefs = prefs;
}
