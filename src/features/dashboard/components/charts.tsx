"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

/**
 * Recharts column charts for the dashboard. They receive already-aggregated,
 * server-computed points (numbers for geometry plus formatted text for every
 * label), so no financial calculation happens in the browser.
 *
 * Mark specs (docs/UI_GUIDELINES.md §10): ≤24px bars with 4px rounded tops and
 * a 2px gap, 1px solid recessive grid, one y-axis, compact ticks, legend for two
 * series, tooltip on hover/focus, text in text colours (never series colours).
 */

export interface ChartPoint {
  label: string;
  title: string;
  income: number;
  expense: number;
  incomeText: string;
  expenseText: string;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

function TooltipBox({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color: string }[];
}) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ background: row.color }}
            />
            {row.label}
          </span>
          <span className="font-medium tabular-nums">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-muted-foreground" aria-label="Legend">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const INCOME = "var(--chart-income)";
const EXPENSE = "var(--chart-expense)";

/** Income vs expenses per day/week/month: grouped columns, income always left of expenses. */
export function CashFlowChart({
  points,
  summary,
  everyLabel = false,
  series = "both",
}: {
  points: ChartPoint[];
  summary: string;
  /** Show every x label (monthly buckets: at most ~12 short labels). */
  everyLabel?: boolean;
  /** Draw both series, or only income / only expenses (reports). */
  series?: "both" | "income" | "expense";
}) {
  const showIncome = series !== "expense";
  const showExpense = series !== "income";
  const tooltip = ({ active, payload }: TooltipContentProps<ValueType, NameType>) => {
    const point = active ? (payload?.[0]?.payload as ChartPoint | undefined) : undefined;
    if (!point) return null;
    return (
      <TooltipBox
        title={point.title}
        rows={[
          ...(showIncome ? [{ label: "Income", value: point.incomeText, color: INCOME }] : []),
          ...(showExpense ? [{ label: "Expenses", value: point.expenseText, color: EXPENSE }] : []),
        ]}
      />
    );
  };
  return (
    <figure className="flex flex-col gap-3">
      {series === "both" && (
        <Legend
          items={[
            { label: "Income", color: INCOME },
            { label: "Expenses", color: EXPENSE },
          ]}
        />
      )}
      <div className="h-64 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            barGap={2}
            barCategoryGap="20%"
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval={everyLabel ? 0 : "preserveStartEnd"}
              minTickGap={16}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => compact.format(v)}
            />
            <Tooltip content={tooltip} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            {showIncome && (
              <Bar
                dataKey="income"
                name="Income"
                fill={INCOME}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            )}
            {showExpense && (
              <Bar
                dataKey="expense"
                name="Expenses"
                fill={EXPENSE}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

/** Spending per month: one series, one colour; no legend (the title names it). */
export function TrendChart({ points, summary }: { points: ChartPoint[]; summary: string }) {
  const tooltip = ({ active, payload }: TooltipContentProps<ValueType, NameType>) => {
    const point = active ? (payload?.[0]?.payload as ChartPoint | undefined) : undefined;
    if (!point) return null;
    return (
      <TooltipBox
        title={point.title}
        rows={[{ label: "Spent", value: point.expenseText, color: "var(--chart-1)" }]}
      />
    );
  };
  return (
    <figure className="flex flex-col gap-3">
      <div className="h-56 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            barCategoryGap="30%"
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval={0}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => compact.format(v)}
            />
            <Tooltip content={tooltip} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            <Bar
              dataKey="expense"
              name="Spent"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
