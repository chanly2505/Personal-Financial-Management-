"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { KIND_LABELS, LEDGER_KINDS, SORT_LABELS, SORT_OPTIONS } from "../constants";
import type { LedgerFilters as Filters } from "../schemas";
import { activeFilterCount, ledgerHref } from "../url";

const ALL = "all";

type Draft = Record<
  "q" | "kind" | "accountId" | "categoryId" | "from" | "to" | "min" | "max" | "sort",
  string
>;

function toDraft(filters: Filters): Draft {
  return {
    q: filters.q ?? "",
    kind: filters.kind ?? ALL,
    accountId: filters.accountId ?? ALL,
    categoryId: filters.categoryId ?? ALL,
    from: filters.from ?? "",
    to: filters.to ?? "",
    min: filters.min ?? "",
    max: filters.max ?? "",
    sort: filters.sort,
  };
}

/**
 * Search, filter and sort the ledger. Filters live in the URL (shareable,
 * back-button friendly); applying them always returns to page 1. On phones
 * everything but the search box folds away behind "Filters".
 */
export function LedgerFilters({
  filters,
  accounts,
  categories,
}: {
  filters: Filters;
  accounts: { id: string; name: string; currency: string; isArchived: boolean }[];
  categories: { id: string; name: string; type: "INCOME" | "EXPENSE"; isArchived: boolean }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => toDraft(filters));
  const active = activeFilterCount(filters);
  const [open, setOpen] = useState(active - (filters.q ? 1 : 0) > 0);

  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const visibleCategories = categories.filter((c) => draft.kind === ALL || draft.kind === c.type);

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const pick = (value: string) =>
      value === ALL || value.trim() === "" ? undefined : value.trim();
    router.push(
      ledgerHref({
        q: pick(draft.q),
        kind: pick(draft.kind),
        accountId: pick(draft.accountId),
        categoryId: draft.kind === "TRANSFER" ? undefined : pick(draft.categoryId),
        from: pick(draft.from),
        to: pick(draft.to),
        min: pick(draft.min),
        max: pick(draft.max),
        sort: draft.sort,
      }),
    );
  }

  return (
    <form
      onSubmit={apply}
      role="search"
      aria-label="Filter transactions"
      className="flex flex-col gap-3"
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search payee, note, category or account"
            placeholder="Search payee, note, category…"
            className="pl-9"
            value={draft.q}
            maxLength={80}
            onChange={(e) => set("q")(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls="ledger-filter-panel"
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersHorizontal aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Filters</span>
          {active > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {active}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
        <Button type="submit">Apply</Button>
      </div>

      <div
        id="ledger-filter-panel"
        hidden={!open}
        className={cn("grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4")}
      >
        <FormField id="filter-kind" label="Type">
          <SelectField
            value={draft.kind}
            onValueChange={set("kind")}
            options={[
              { value: ALL, label: "All types" },
              ...LEDGER_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
            ]}
          />
        </FormField>
        <FormField id="filter-account" label="Account">
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
        <FormField id="filter-category" label="Category">
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
        <FormField id="filter-sort" label="Sort by">
          <SelectField
            value={draft.sort}
            onValueChange={set("sort")}
            options={SORT_OPTIONS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
          />
        </FormField>
        <FormField id="filter-from" label="From date">
          <DateInput value={draft.from} onChange={(e) => set("from")(e.target.value)} />
        </FormField>
        <FormField id="filter-to" label="To date">
          <DateInput value={draft.to} onChange={(e) => set("to")(e.target.value)} />
        </FormField>
        <FormField id="filter-min" label="Minimum amount">
          <Input
            inputMode="decimal"
            placeholder="0"
            value={draft.min}
            onChange={(e) => set("min")(e.target.value)}
          />
        </FormField>
        <FormField id="filter-max" label="Maximum amount">
          <Input
            inputMode="decimal"
            placeholder="Any"
            value={draft.max}
            onChange={(e) => set("max")(e.target.value)}
          />
        </FormField>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Apply filters</Button>
          {active > 0 && (
            <Button asChild variant="ghost">
              <Link href={ledgerHref({ sort: filters.sort })}>Clear filters</Link>
            </Button>
          )}
          <p className="ml-auto hidden text-xs text-muted-foreground lg:block">
            Amounts match each record in its own currency.
          </p>
        </div>
      </div>
    </form>
  );
}
