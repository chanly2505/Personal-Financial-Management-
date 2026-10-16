"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { MONTH_PATTERN } from "../constants";

/** Previous / next month links plus a month picker; the month lives in the URL. */
export function MonthNav({
  month,
  label,
  previous,
  next,
  current,
  min,
  max,
}: {
  month: string;
  label: string;
  previous: string | null;
  next: string | null;
  current: string;
  min: string;
  max: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <nav
      aria-label="Month"
      className="flex flex-wrap items-center gap-2"
      data-pending={pending || undefined}
    >
      <Button
        asChild={previous !== null}
        variant="outline"
        size="icon"
        disabled={previous === null}
      >
        {previous ? (
          <Link href={`/budgets?month=${previous}`} aria-label="Previous month" scroll={false}>
            <ChevronLeft aria-hidden="true" />
          </Link>
        ) : (
          <span aria-label="Previous month">
            <ChevronLeft aria-hidden="true" />
          </span>
        )}
      </Button>
      <h2 className="min-w-40 text-center text-lg font-semibold" aria-live="polite">
        {label}
      </h2>
      <Button asChild={next !== null} variant="outline" size="icon" disabled={next === null}>
        {next ? (
          <Link href={`/budgets?month=${next}`} aria-label="Next month" scroll={false}>
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <span aria-label="Next month">
            <ChevronRight aria-hidden="true" />
          </span>
        )}
      </Button>
      <label htmlFor="month-jump" className="sr-only">
        Go to month
      </label>
      <Input
        id="month-jump"
        type="month"
        className="w-40"
        min={min}
        max={max}
        defaultValue={month}
        onChange={(e) => {
          const value = e.target.value;
          if (MONTH_PATTERN.test(value) && value >= min && value <= max) {
            startTransition(() => router.push(`/budgets?month=${value}`, { scroll: false }));
          }
        }}
      />
      {month !== current && (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/budgets?month=${current}`} scroll={false}>
            This month
          </Link>
        </Button>
      )}
    </nav>
  );
}
