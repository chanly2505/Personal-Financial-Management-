"use client";

import { createContext, useContext } from "react";

import { DEFAULT_FORMAT_PREFS, type FormatPrefs } from "@/lib/format/preferences";

/**
 * The signed-in user's display preferences for client components. Server
 * components get the same values per request (src/server/format-context.ts);
 * client components read them here and pass them to the formatters, so the
 * server-rendered HTML and the browser always agree.
 */
const FormatPrefsContext = createContext<FormatPrefs>(DEFAULT_FORMAT_PREFS);

export function FormatProvider({
  prefs,
  children,
}: {
  prefs: FormatPrefs;
  children: React.ReactNode;
}) {
  return <FormatPrefsContext.Provider value={prefs}>{children}</FormatPrefsContext.Provider>;
}

export function useFormatPrefs(): FormatPrefs {
  return useContext(FormatPrefsContext);
}
