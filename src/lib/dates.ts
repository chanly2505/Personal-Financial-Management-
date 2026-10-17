/**
 * Calendar-date handling.
 *
 * Financial events are recorded as calendar dates ("2026-10-15") with no time
 * component, interpreted in the user's IANA timezone. In TypeScript they are
 * ISO date strings (`IsoDate`); in PostgreSQL they are DATE columns, which
 * Prisma surfaces as a JS Date at 00:00:00 UTC. Never call `new Date()` on a
 * date-only value without going through these helpers.
 */

import { formatDate } from "./format/dates";
import type { FormatPrefs } from "./format/preferences";

export type IsoDate = string & { readonly __brand: "IsoDate" };

export const DEFAULT_TIMEZONE = "Asia/Phnom_Penh";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function toIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) throw new RangeError(`Invalid calendar date: ${value}`);
  return value;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function fromParts(year: number, month: number, day: number): IsoDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}` as IsoDate;
}

function parts(date: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Old IANA names that ICU (Node, browsers) still lists as canonical but that
 * PostgreSQL rejects when built against tzdata without the "backward" aliases
 * (e.g. Ubuntu 24.04). Stored timezones must work in both, because the
 * recurring engine evaluates "today" in SQL for every user at once (QA-01).
 */
export const LEGACY_TIME_ZONES: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

function acceptedByIntl(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

let choices: string[] | undefined;

/**
 * The timezones a user can choose: the runtime's IANA list with old names
 * replaced by their current ones, plus "UTC". No offsets ("+01:00") — PostgreSQL
 * reads those with the opposite sign — and no removed names ("US/Pacific-New").
 */
export function timeZoneChoices(): readonly string[] {
  choices ??= [
    ...new Set([
      ...Intl.supportedValuesOf("timeZone").map((tz) => LEGACY_TIME_ZONES[tz] ?? tz),
      "UTC",
    ]),
  ]
    .filter(acceptedByIntl)
    .sort();
  return choices;
}

/** The name to store for `timeZone` (old aliases → current name), or null if not allowed. */
export function normalizeTimeZone(timeZone: string): string | null {
  const name = LEGACY_TIME_ZONES[timeZone] ?? timeZone;
  return timeZoneChoices().includes(name) ? name : null;
}

/** True if `timeZone` may be stored as a user's timezone. */
export function isValidTimeZone(timeZone: string): boolean {
  return normalizeTimeZone(timeZone) !== null;
}

/** The calendar date it currently is in `timeZone`. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(formatted.find((p) => p.type === type)?.value);
  return fromParts(get("year"), get("month"), get("day"));
}

/** IsoDate -> Date for a Prisma `@db.Date` field (midnight UTC). */
export function isoDateToDb(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Date from a Prisma `@db.Date` field -> IsoDate. */
export function dbDateToIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10) as IsoDate;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parts(date);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return fromParts(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

/**
 * Add calendar months, clamping to the last day of the target month
 * (2026-01-31 + 1 month = 2026-02-28). Always compute from the original anchor
 * date rather than chaining, or clamped days will drift (31 -> 28 -> 28 ...).
 */
export function addMonthsClamped(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parts(date);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  return fromParts(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** First day of the month containing `date`. */
export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parts(date);
  return fromParts(year, month, 1);
}

/** Last day of the month containing `date`. */
export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parts(date);
  return fromParts(year, month, daysInMonth(year, month));
}

export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Display a calendar date in the user's date format (e.g. "15 Oct 2026",
 * src/lib/format/dates.ts), or "Today" / "Yesterday" relative to `today` when
 * given. The date is already the user's local date, so no timezone shift applies.
 */
export function formatCalendarDate(date: IsoDate, today?: IsoDate, prefs?: FormatPrefs): string {
  if (today) {
    if (date === today) return "Today";
    if (date === addDays(today, -1)) return "Yesterday";
  }
  return formatDate(date, prefs);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((isoDateToDb(b).getTime() - isoDateToDb(a).getTime()) / 86_400_000);
}

/** Monday of the ISO week containing `date` (matches PostgreSQL date_trunc('week')). */
export function startOfWeek(date: IsoDate): IsoDate {
  const weekday = isoDateToDb(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** First day of the year containing `date`. */
export function startOfYear(date: IsoDate): IsoDate {
  return fromParts(parts(date).year, 1, 1);
}
