import { type IsoDate, addDays, addMonthsClamped, daysBetween, isoDateToDb } from "@/lib/dates";

import { FREQUENCY_LABELS, type Frequency } from "./constants";

/**
 * Calendar policy (docs/PRD.md §6.6). Occurrence k is computed from the start
 * date — never from the previous occurrence — so short months never shift
 * later dates:
 * - weekly:  start + 7 × interval × k days;
 * - monthly: start + interval × k months, clamped to the month's last day
 *            (31 Jan → 28/29 Feb → 31 Mar → 30 Apr → 31 May …);
 * - yearly:  start + 12 × interval × k months, same clamping
 *            (29 Feb → 28 Feb in common years → 29 Feb in leap years).
 * All dates are calendar dates in the user's timezone.
 */

export interface Schedule {
  frequency: Frequency;
  interval: number;
  startOn: IsoDate;
  endOn: IsoDate | null;
}

function monthsPerStep(s: Schedule): number {
  return s.frequency === "YEARLY" ? 12 * s.interval : s.interval;
}

export function occurrenceAt(s: Schedule, k: number): IsoDate {
  if (s.frequency === "WEEKLY") return addDays(s.startOn, 7 * s.interval * k);
  return addMonthsClamped(s.startOn, monthsPerStep(s) * k);
}

/** The first occurrence on or after `date`, ignoring the end date. */
export function firstOnOrAfter(s: Schedule, date: IsoDate): IsoDate {
  if (date <= s.startOn) return s.startOn;
  if (s.frequency === "WEEKLY") {
    const step = 7 * s.interval;
    return occurrenceAt(s, Math.ceil(daysBetween(s.startOn, date) / step));
  }
  const [sy, sm] = s.startOn.split("-").map(Number) as [number, number];
  const [dy, dm] = date.split("-").map(Number) as [number, number];
  const months = (dy - sy) * 12 + (dm - sm);
  let k = Math.max(0, Math.floor(months / monthsPerStep(s)));
  while (occurrenceAt(s, k) < date) k += 1;
  return occurrenceAt(s, k);
}

/** The first occurrence on or after `date` that is within the end date, or null. */
export function nextScheduled(s: Schedule, date: IsoDate): IsoDate | null {
  const next = firstOnOrAfter(s, date);
  return s.endOn && next > s.endOn ? null : next;
}

/** The occurrence after `date` (exclusive), within the end date, or null. */
export function nextAfter(s: Schedule, date: IsoDate): IsoDate | null {
  return nextScheduled(s, addDays(date, 1));
}

/** Occurrences from `from` up to `until` (inclusive), at most `limit`. */
export function occurrencesBetween(
  s: Schedule,
  from: IsoDate,
  until: IsoDate,
  limit = 100,
): IsoDate[] {
  const dates: IsoDate[] = [];
  let next = nextScheduled(s, from);
  while (next && next <= until && dates.length < limit) {
    dates.push(next);
    next = nextAfter(s, next);
  }
  return dates;
}

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? "st"
      : n % 10 === 2 && n !== 12
        ? "nd"
        : n % 10 === 3 && n !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}

/** Plain-language schedule, including the short-month rule when it applies. */
export function describeSchedule(s: Pick<Schedule, "frequency" | "interval" | "startOn">): string {
  const unit = FREQUENCY_LABELS[s.frequency];
  const every = s.interval === 1 ? `Every ${unit.one}` : `Every ${s.interval} ${unit.many}`;
  const start = isoDateToDb(s.startOn);
  if (s.frequency === "WEEKLY") return `${every} on ${weekday.format(start)}`;
  const [, m, d] = s.startOn.split("-").map(Number) as [number, number, number];
  if (s.frequency === "MONTHLY") {
    const note = d > 28 ? ` (the last day in shorter months)` : "";
    return `${every} on the ${ordinal(d)}${note}`;
  }
  const leapDay = m === 2 && d === 29;
  return `${every} on ${dayMonth.format(start)}${leapDay ? " (28 February in common years)" : ""}`;
}
