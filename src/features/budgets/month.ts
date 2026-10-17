import { type IsoDate, addMonthsClamped, endOfMonth, startOfMonth } from "@/lib/dates";
import { formatMonthYear } from "@/lib/format/dates";
import type { FormatPrefs } from "@/lib/format/preferences";

import { MONTH_PATTERN } from "./constants";

/** "2026-10" ↔ the first day of that month. */
export type MonthKey = string & { readonly __brand: "MonthKey" };

export function isMonthKey(value: string): value is MonthKey {
  return MONTH_PATTERN.test(value);
}

export function monthKeyOf(date: IsoDate): MonthKey {
  return date.slice(0, 7) as MonthKey;
}

export function monthStart(month: MonthKey): IsoDate {
  return `${month}-01` as IsoDate;
}

export function monthEnd(month: MonthKey): IsoDate {
  return endOfMonth(monthStart(month));
}

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  return monthKeyOf(addMonthsClamped(startOfMonth(monthStart(month)), by));
}

/** "October 2026" (or "2026-10" with the ISO date format). */
export function monthLabel(month: MonthKey, prefs?: FormatPrefs): string {
  return formatMonthYear(monthStart(month), "long", prefs);
}
