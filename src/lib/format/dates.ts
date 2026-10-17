import { activeFormatPrefs } from "./active";
import type { FormatPrefs } from "./preferences";

/**
 * Calendar-date display per the user's date format (docs/PRD.md §6.13).
 * Inputs are ISO calendar dates (YYYY-MM-DD) that already are the user's local
 * dates, so formatting happens in UTC — no timezone shift can move a day.
 * Month and weekday names are English for now (see docs/I18N.md).
 */

type Iso = string;

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
const shortMonth = fmt({ month: "short" });
const longMonth = fmt({ month: "long" });
const weekdayLong = fmt({ weekday: "long" });

function split(iso: Iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return {
    date,
    y: iso.slice(0, 4),
    m: iso.slice(5, 7),
    d: String(Number(iso.slice(8, 10))),
    dd: iso.slice(8, 10),
  };
}

/** "17 Oct 2026" · "Oct 17, 2026" · "17/10/2026" · "2026-10-17" */
export function formatDate(iso: Iso, prefs: FormatPrefs = activeFormatPrefs()): string {
  const { date, y, m, d, dd } = split(iso);
  switch (prefs.dateFormat) {
    case "D_MMM_Y":
      return `${d} ${shortMonth.format(date)} ${y}`;
    case "MMM_D_Y":
      return `${shortMonth.format(date)} ${d}, ${y}`;
    case "DD_MM_Y":
      return `${dd}/${m}/${y}`;
    case "ISO":
      return iso;
  }
}

/** Short day label for chart axes: "17 Oct" · "Oct 17" · "17/10" · "10-17" */
export function formatDayMonth(iso: Iso, prefs: FormatPrefs = activeFormatPrefs()): string {
  const { date, m, d, dd } = split(iso);
  switch (prefs.dateFormat) {
    case "D_MMM_Y":
      return `${d} ${shortMonth.format(date)}`;
    case "MMM_D_Y":
      return `${shortMonth.format(date)} ${d}`;
    case "DD_MM_Y":
      return `${dd}/${m}`;
    case "ISO":
      return `${m}-${dd}`;
  }
}

/** "17 October" · "October 17" (in schedules: "on 17 October"). Numeric formats use the first. */
export function formatDayMonthLong(iso: Iso, prefs: FormatPrefs = activeFormatPrefs()): string {
  const { date, d } = split(iso);
  return prefs.dateFormat === "MMM_D_Y"
    ? `${longMonth.format(date)} ${d}`
    : `${d} ${longMonth.format(date)}`;
}

/** "October 2026" (long) or "Oct 2026"; ISO format: "2026-10". */
export function formatMonthYear(
  iso: Iso,
  length: "long" | "short" = "long",
  prefs: FormatPrefs = activeFormatPrefs(),
): string {
  const { date, y, m } = split(iso);
  if (prefs.dateFormat === "ISO") return `${y}-${m}`;
  return `${(length === "long" ? longMonth : shortMonth).format(date)} ${y}`;
}

/** "Oct" — month names are unambiguous in every format. */
export function formatMonthShort(iso: Iso): string {
  return shortMonth.format(split(iso).date);
}

/** "Monday" */
export function formatWeekday(iso: Iso): string {
  return weekdayLong.format(split(iso).date);
}

/** A range: "1 Mar – 31 Mar 2026", "Mar 1 – Mar 31, 2026", "01/03/2026 – 31/03/2026". */
export function formatDateRange(
  from: Iso,
  to: Iso,
  prefs: FormatPrefs = activeFormatPrefs(),
): string {
  if (from === to) return formatDate(from, prefs);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  if (sameYear && (prefs.dateFormat === "D_MMM_Y" || prefs.dateFormat === "MMM_D_Y")) {
    return `${formatDayMonth(from, prefs)} – ${formatDate(to, prefs)}`;
  }
  return `${formatDate(from, prefs)} – ${formatDate(to, prefs)}`;
}

/** A point in time shown as the calendar date it was in `timeZone`. */
export function formatInstant(
  instant: Date,
  timeZone: string,
  prefs: FormatPrefs = activeFormatPrefs(),
): string {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return formatDate(iso, prefs);
}
