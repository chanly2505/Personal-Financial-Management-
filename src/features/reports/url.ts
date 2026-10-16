import { exportHref, ledgerHref } from "@/features/transactions/url";

import { DEFAULT_REPORT, DEFAULT_REPORT_PRESET } from "./constants";
import type { ReportPeriod } from "./period";

/** Filter keys kept in the /reports URL, in a stable order. */
const KEYS = [
  "report",
  "period",
  "from",
  "to",
  "granularity",
  "accountId",
  "kind",
  "categoryId",
  "currency",
] as const;
type Key = (typeof KEYS)[number];
type Values = Partial<Record<Key, string | undefined>>;

const DEFAULTS: Partial<Record<Key, string>> = {
  report: DEFAULT_REPORT,
  period: DEFAULT_REPORT_PRESET,
  granularity: "auto",
};

/** A /reports URL for `filters` with `overrides`; defaults are omitted. Dates only for custom ranges. */
export function reportHref(filters: Values, overrides: Values = {}): string {
  const merged: Values = { ...filters, ...overrides };
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = merged[key];
    if (!value || value === DEFAULTS[key]) continue;
    if ((key === "from" || key === "to") && merged.period !== "custom") continue;
    params.set(key, value);
  }
  const query = params.toString();
  return query ? `/reports?${query}` : "/reports";
}

/** The CSV export of the records behind a report: same dates, account, type, category and currency. */
export function reportExportHref(period: ReportPeriod, filters: Values): string {
  return exportHref({
    from: period.from,
    to: period.to,
    accountId: filters.accountId,
    kind: filters.kind,
    categoryId: filters.categoryId,
    currency: filters.currency,
    sort: "date_asc",
  });
}

/** The /transactions list showing the same records (to check a report against its source rows). */
export function reportLedgerHref(period: ReportPeriod, filters: Values): string {
  return ledgerHref({
    from: period.from,
    to: period.to,
    accountId: filters.accountId,
    kind: filters.kind,
    categoryId: filters.categoryId,
    currency: filters.currency,
  });
}
