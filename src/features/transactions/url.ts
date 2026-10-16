/** Filter keys kept in the /transactions URL, in a stable order. */
const KEYS = [
  "q",
  "kind",
  "accountId",
  "categoryId",
  "currency",
  "from",
  "to",
  "min",
  "max",
  "sort",
] as const;

/** Any filter shape: parsed LedgerFilters or a draft from the filter form. */
type FilterValues = { [K in (typeof KEYS)[number]]?: string | undefined } & { page?: number };

/**
 * Build a /transactions URL for `filters` with `overrides` applied. Defaults
 * (newest first, page 1) are left out so URLs stay short and shareable.
 */
export function ledgerHref(
  filters: FilterValues,
  overrides: Partial<Record<(typeof KEYS)[number] | "page", string | number | undefined>> = {},
): string {
  const params = new URLSearchParams();
  const merged: Record<string, unknown> = { ...filters, ...overrides };
  for (const key of KEYS) {
    const value = merged[key];
    if (value === undefined || value === "" || (key === "sort" && value === "date_desc")) continue;
    params.set(key, String(value));
  }
  const page = Number(merged.page ?? 1);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/transactions?${query}` : "/transactions";
}

/** Number of filters that narrow the list (sorting and paging don't count). */
export function activeFilterCount(filters: FilterValues): number {
  return (
    ["q", "kind", "accountId", "categoryId", "currency", "from", "to", "min", "max"] as const
  ).filter((key) => filters[key] !== undefined && filters[key] !== "").length;
}

/**
 * The CSV export URL for the same filters (docs/REPORTS.md §Export). Sorting by
 * amount is not applied to exports (they are always in date order).
 */
export function exportHref(filters: FilterValues): string {
  const href = ledgerHref(filters);
  const query = href.includes("?") ? href.slice(href.indexOf("?")) : "";
  return `/api/transactions/export${query}`;
}
