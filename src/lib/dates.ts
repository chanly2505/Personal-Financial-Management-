/**
 * Calendar-date handling.
 *
 * Financial events are recorded as calendar dates ("2026-10-15") with no time
 * component, interpreted in the user's IANA timezone. In TypeScript they are
 * ISO date strings (`IsoDate`); in PostgreSQL they are DATE columns, which
 * Prisma surfaces as a JS Date at 00:00:00 UTC. Never call `new Date()` on a
 * date-only value without going through these helpers.
 */

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

/** True if `timeZone` is a valid IANA identifier in this runtime. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
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
