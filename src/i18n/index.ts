import { type Messages, en } from "./messages/en";

/**
 * UI text lookup (docs/I18N.md). English only today; the structure is ready
 * for Khmer: add messages/km.ts typed as `Messages`, add "km" to LOCALES and
 * pick the locale per user.
 */
export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

const CATALOGS: Record<Locale, Messages> = { en };

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return CATALOGS[locale];
}

/** Dotted paths to every string, e.g. "common.save" | "nav.dashboard.label". */
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;

/**
 * Look up a message and fill `{placeholders}`. Numbers, money and dates must be
 * formatted before they are passed in (src/lib/format), never concatenated
 * around a translated fragment — word order differs between languages.
 */
export function t(
  key: MessageKey,
  values: Record<string, string> = {},
  locale: Locale = DEFAULT_LOCALE,
): string {
  let node: unknown = getMessages(locale);
  for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
  if (typeof node !== "string") throw new Error(`Missing message: ${key}`);
  return node.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}
