import { activeFormatPrefs } from "./active";
import { type FormatPrefs, SEPARATORS } from "./preferences";

/**
 * Locale-neutral number formatting. Intl formats in en-US (fixed digits, symbol
 * placement and minus sign), then the grouping and decimal characters are
 * swapped for the user's choice. Numbers are never rounded here beyond the
 * digits requested.
 */

/** Replace en-US separators in Intl parts with the preferred ones. */
export function withSeparators(parts: Intl.NumberFormatPart[], prefs: FormatPrefs): string {
  const sep = SEPARATORS[prefs.numberFormat];
  return parts
    .map((p) => (p.type === "group" ? sep.group : p.type === "decimal" ? sep.decimal : p.value))
    .join("");
}

const cache = new Map<string, Intl.NumberFormat>();
function numberFormat(digits: number, grouping: boolean): Intl.NumberFormat {
  const key = `${digits}|${grouping}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: grouping,
    });
    cache.set(key, f);
  }
  return f;
}

/** 12345 → "12,345" (or "12.345", "12 345"). */
export function formatInteger(value: number, prefs: FormatPrefs = activeFormatPrefs()): string {
  return withSeparators(numberFormat(0, true).formatToParts(value), prefs);
}

/** 96.2 → "96.2%" (or "96,2%"); `digits` decimals, half away from zero by Intl. */
export function formatPercent(
  value: number,
  digits = 1,
  prefs: FormatPrefs = activeFormatPrefs(),
): string {
  return `${withSeparators(numberFormat(digits, true).formatToParts(value), prefs)}%`;
}
