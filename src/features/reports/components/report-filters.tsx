"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { KIND_LABELS, LEDGER_KINDS } from "@/features/transactions/constants";
import { CURRENCY_CODES } from "@/lib/money";
import { cn } from "@/lib/utils";

import {
  GRANULARITY_LABELS,
  GRANULARITY_OPTIONS,
  REPORT_PRESET_LABELS,
  REPORT_PRESETS,
} from "../constants";
import type { ReportFilters as Filters } from "../schemas";
import { reportHref } from "../url";

const ALL = "all";

type Draft = Record<
  "period" | "from" | "to" | "granularity" | "accountId" | "kind" | "categoryId" | "currency",
  string
>;

/**
 * The one filter bar for every report. Filters live in the URL, so a report
 * can be bookmarked or shared and the back button works. While the next report
 * loads, the current one stays on screen, dimmed by the page (`data-pending`).
 */
export function ReportFilters({
  filters,
  range,
  rangeText,
  accounts,
  categories,
}: {
  filters: Filters;
  /** The resolved period, used to prefill a custom range. */
  range: { from: string; to: string };
  rangeText: string;
  accounts: { id: string; name: string; currency: string; isArchived: boolean }[];
  categories: { id: string; name: string; type: "INCOME" | "EXPENSE"; isArchived: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Phones: the filters fold away behind a button (the range stays visible).
  const [open, setOpen] = useState(false);
  const activeCount = [
    filters.accountId,
    filters.kind,
    filters.categoryId,
    filters.currency,
    filters.granularity !== "auto" ? filters.granularity : undefined,
  ].filter(Boolean).length;
  const [draft, setDraft] = useState<Draft>({
    period: filters.period,
    from: filters.from ?? range.from,
    to: filters.to ?? range.to,
    granularity: filters.granularity,
    accountId: filters.accountId ?? ALL,
    kind: filters.kind ?? ALL,
    categoryId: filters.categoryId ?? ALL,
    currency: filters.currency ?? ALL,
  });
  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const visibleCategories = categories.filter((c) => draft.kind === ALL || draft.kind === c.type);
  const pick = (value: string) => (value === ALL || value === "" ? undefined : value);

  function apply(event: React.FormEvent) {
    event.preventDefault();
    if (draft.period === "custom" && (!draft.from || !draft.to)) {
      setError("Choose both dates for a custom range.");
      return;
    }
    setError(null);
    const href = reportHref({
      report: filters.report,
      period: draft.period,
      from: draft.from,
      to: draft.to,
      granularity: draft.granularity,
      accountId: pick(draft.accountId),
      kind: pick(draft.kind),
      categoryId:
        draft.kind === "TRANSFER" || !visibleCategories.some((c) => c.id === draft.categoryId)
          ? undefined
          : pick(draft.categoryId),
      currency: pick(draft.currency),
    });
    startTransition(() => router.push(href, { scroll: false }));
  }

  return (
    <form
      onSubmit={apply}
      noValidate
      aria-label="Report filters"
      data-pending={pending || undefined}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <p className="text-sm text-muted-foreground">{rangeText}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls="report-filter-panel"
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeCount}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
      </div>
      <div
        id="report-filter-panel"
        className={cn("flex-col gap-4 sm:flex", open ? "flex" : "hidden")}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField id="report-period" label="Period">
            <SelectField
              value={draft.period}
              onValueChange={set("period")}
              options={REPORT_PRESETS.map((p) => ({ value: p, label: REPORT_PRESET_LABELS[p] }))}
            />
          </FormField>
          {draft.period === "custom" && (
            <>
              <FormField id="report-from" label="From">
                <DateInput value={draft.from} onChange={(e) => set("from")(e.target.value)} />
              </FormField>
              <FormField id="report-to" label="To">
                <DateInput value={draft.to} onChange={(e) => set("to")(e.target.value)} />
              </FormField>
            </>
          )}
          <FormField id="report-granularity" label="Group by">
            <SelectField
              value={draft.granularity}
              onValueChange={set("granularity")}
              options={GRANULARITY_OPTIONS.map((g) => ({ value: g, label: GRANULARITY_LABELS[g] }))}
            />
          </FormField>
          <FormField id="report-account" label="Account">
            <SelectField
              value={draft.accountId}
              onValueChange={set("accountId")}
              options={[
                { value: ALL, label: "All accounts" },
                ...accounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} · ${a.currency}${a.isArchived ? " (archived)" : ""}`,
                })),
              ]}
            />
          </FormField>
          <FormField id="report-kind" label="Type">
            <SelectField
              value={draft.kind}
              onValueChange={set("kind")}
              options={[
                { value: ALL, label: "All types" },
                ...LEDGER_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
              ]}
            />
          </FormField>
          <FormField id="report-category" label="Category">
            <SelectField
              value={
                visibleCategories.some((c) => c.id === draft.categoryId) ? draft.categoryId : ALL
              }
              onValueChange={set("categoryId")}
              disabled={draft.kind === "TRANSFER"}
              options={[
                { value: ALL, label: "All categories" },
                ...visibleCategories.map((c) => ({
                  value: c.id,
                  label: `${c.name}${draft.kind === ALL ? (c.type === "INCOME" ? " · income" : " · expense") : ""}${c.isArchived ? " (archived)" : ""}`,
                })),
              ]}
            />
          </FormField>
          <FormField id="report-currency" label="Currency">
            <SelectField
              value={draft.currency}
              onValueChange={set("currency")}
              options={[
                { value: ALL, label: "All currencies" },
                ...CURRENCY_CODES.map((c) => ({ value: c, label: c })),
              ]}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Apply filters
          </Button>
          <Button asChild variant="ghost">
            <Link href={reportHref({ report: filters.report })}>Reset</Link>
          </Button>
          <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
            {pending ? "Updating…" : <span className="hidden sm:inline">{rangeText}</span>}
          </p>
          {error && (
            <p role="alert" className="basis-full text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
