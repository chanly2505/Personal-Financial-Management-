"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { PERIOD_LABELS, PERIOD_PRESETS, type PeriodPreset } from "../constants";

/**
 * The dashboard's single filter row: one period for every card, chart and list.
 * Navigation keeps the current dashboard on screen (dimmed by the parent via
 * `data-pending`) instead of flashing a skeleton.
 */
export function PeriodPicker({
  preset,
  from,
  to,
  currency,
  rangeText,
}: {
  preset: PeriodPreset;
  from: string;
  to: string;
  currency?: string | undefined;
  rangeText: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(preset === "custom");
  const [draft, setDraft] = useState({ from, to });
  const [error, setError] = useState<string | null>(null);

  function go(params: Record<string, string | undefined>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, currency })) {
      if (value) search.set(key, value);
    }
    startTransition(() => router.push(`/dashboard?${search.toString()}`, { scroll: false }));
  }

  function choose(next: PeriodPreset) {
    if (next === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    go({ period: next });
  }

  function applyCustom(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.from || !draft.to) {
      setError("Choose both dates.");
      return;
    }
    setError(null);
    go({ period: "custom", from: draft.from, to: draft.to });
  }

  const selected = customOpen ? "custom" : preset;

  return (
    <div className="flex flex-col gap-3" data-pending={pending || undefined}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Phones: a dropdown. Larger screens: a segmented control. */}
        <div className="sm:hidden">
          <Label htmlFor="period-select" className="sr-only">
            Period
          </Label>
          <SelectField
            id="period-select"
            value={selected}
            onValueChange={(v) => choose(v as PeriodPreset)}
            options={PERIOD_PRESETS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
          />
        </div>
        <div
          role="group"
          aria-label="Period"
          className="hidden w-fit flex-wrap gap-1 rounded-lg bg-muted p-1 sm:flex"
        >
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={selected === p}
              onClick={() => choose(p)}
              className={cn(
                "h-8 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-md:h-10",
                selected === p
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {pending ? "Updating…" : rangeText}
        </p>
      </div>

      {customOpen && (
        <form
          onSubmit={applyCustom}
          noValidate
          aria-label="Custom date range"
          className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end"
        >
          <div className="grid flex-1 gap-2">
            <Label htmlFor="range-from">From</Label>
            <DateInput
              id="range-from"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            />
          </div>
          <div className="grid flex-1 gap-2">
            <Label htmlFor="range-to">To</Label>
            <DateInput
              id="range-to"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />
          </div>
          <Button type="submit">Apply range</Button>
          {error && (
            <p role="alert" className="text-sm text-destructive sm:basis-full">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
