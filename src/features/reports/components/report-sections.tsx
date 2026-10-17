import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BarChart3, Landmark, Minus, PieChart } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { BudgetStatusLabel } from "@/features/budgets/components/budget-progress";
import { monthLabel } from "@/features/budgets/month";
import { BarList } from "@/features/dashboard/components/bar-list";
import { ChartCard, DataTable } from "@/features/dashboard/components/chart-card";
import { CashFlowChart, type ChartPoint } from "@/features/dashboard/components/charts";
import { toChartNumber } from "@/features/dashboard/format";
import { type IsoDate, formatCalendarDate } from "@/lib/dates";
import { type CurrencyCode, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { Granularity } from "../constants";
import { GRANULARITY_COLUMN, GRANULARITY_UNIT, bucketLabel, bucketTitle } from "../format";
import type {
  AccountHistory,
  BreakdownLine,
  BudgetPerformance,
  Comparison,
  ComparisonLine,
  CurrencyReport,
  ReportTotals,
} from "../types";
import { formatInteger, formatPercent } from "@/lib/format/number";

/**
 * Report bodies (docs/REPORTS.md). Server components: every figure arrives
 * computed by the service; this file only formats. Each chart has a table
 * view, and status/direction is always given in words or signs, not colour.
 */

/* ------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* ------------------------------------------------------------------------- */

type Align = "left" | "right";
interface Column {
  label: string;
  align?: Align;
}

/** A full-width table; scrolls sideways inside its card on narrow screens. */
export function ReportTable({
  caption,
  columns,
  rows,
  footer,
  tall = false,
}: {
  caption: string;
  columns: Column[];
  rows: React.ReactNode[][];
  footer?: React.ReactNode[];
  /** Long series: cap the height and scroll inside, keeping the header and total in view. */
  tall?: boolean;
}) {
  const cell = (align: Align = "right") =>
    cn("px-3 py-2", align === "right" ? "text-right tabular-nums" : "text-left");
  return (
    // Focusable so keyboard users can scroll it (WCAG 2.1.1); named by its caption.
    <div
      tabIndex={0}
      role="region"
      aria-label={caption}
      className={cn(
        "overflow-x-auto rounded-lg border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        tall && "max-h-[36rem] overflow-y-auto",
      )}
    >
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.label}
                scope="col"
                className={cn(cell(c.align ?? (i === 0 ? "left" : "right")), "font-medium")}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((value, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className={cn(cell("left"), "font-normal")}>
                    {value}
                  </th>
                ) : (
                  <td key={i} className={cell(columns[i]?.align)}>
                    {value}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className={cn("border-t bg-muted font-medium", tall && "sticky bottom-0")}>
            <tr>
              {footer.map((value, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className={cell("left")}>
                    {value}
                  </th>
                ) : (
                  <td key={i} className={cell(columns[i]?.align)}>
                    {value}
                  </td>
                ),
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function money(minor: bigint, currency: CurrencyCode) {
  return formatMoney(minor, currency);
}

/** "+$12.00" / "−$12.00" / "$0.00" — the sign carries the direction in text. */
function signedMoney(minor: bigint, currency: CurrencyCode) {
  if (minor === 0n) return formatMoney(0n, currency);
  return `${minor > 0n ? "+" : "−"}${formatMoney(minor > 0n ? minor : -minor, currency)}`;
}

function toPoints(
  report: CurrencyReport,
  granularity: Granularity,
  spansYears: boolean,
): ChartPoint[] {
  const c = report.currency;
  return report.series.map((p) => ({
    label: bucketLabel(p.start, granularity, spansYears),
    title: bucketTitle(p.start, granularity),
    income: toChartNumber(p.incomeMinor, c),
    expense: toChartNumber(p.expenseMinor, c),
    incomeText: money(p.incomeMinor, c),
    expenseText: money(p.expenseMinor, c),
  }));
}

export interface SeriesContext {
  granularity: Granularity;
  spansYears: boolean;
  range: string;
}

/* ------------------------------------------------------------------------- */
/* Summary                                                                    */
/* ------------------------------------------------------------------------- */

export function TotalsSummary({ totals }: { totals: ReportTotals[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {totals.map((t) => (
        <dl
          key={t.currency}
          className="grid grid-cols-2 gap-3 rounded-xl border bg-card px-4 py-3 text-sm sm:grid-cols-4"
        >
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Income · {t.currency}</dt>
            <dd>
              <Money minor={t.incomeMinor} currency={t.currency} className="font-medium" />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Expenses · {t.currency}</dt>
            <dd>
              <Money minor={t.expenseMinor} currency={t.currency} className="font-medium" />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Net · {t.currency}</dt>
            <dd>
              <Money minor={t.netMinor} currency={t.currency} className="font-medium" />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Records</dt>
            <dd className="font-medium tabular-nums">{formatInteger(t.count)}</dd>
          </div>
        </dl>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Income / expense reports                                                   */
/* ------------------------------------------------------------------------- */

function BreakdownCard({
  title,
  description,
  lines,
  currency,
  label,
}: {
  title: string;
  description: string;
  lines: BreakdownLine[];
  currency: CurrencyCode;
  label: string;
}) {
  const total = lines.reduce((s, l) => s + l.amountMinor, 0n);
  return (
    <ChartCard
      title={title}
      description={description}
      table={
        lines.length > 0 ? (
          <DataTable
            caption={`${title} in ${currency}`}
            columns={[label, "Records", "Amount", "Share"]}
            rows={[
              ...lines.map((l) => [
                `${l.name}${l.isArchived ? " (archived)" : ""}`,
                l.count,
                money(l.amountMinor, currency),
                `${formatPercent(l.sharePercent)}`,
              ]),
              ["Total", lines.reduce((s, l) => s + l.count, 0), money(total, currency), "100%"],
            ]}
          />
        ) : undefined
      }
    >
      {lines.length > 0 ? (
        <BarList
          label={`${title} in ${currency}`}
          items={lines.map((l) => ({
            key: l.id,
            label: l.name,
            hint: l.isArchived ? "Archived" : undefined,
            swatch: l.color,
            value: toChartNumber(l.amountMinor, currency),
            valueText: `${money(l.amountMinor, currency)} · ${formatPercent(l.sharePercent)}`,
          }))}
        />
      ) : (
        <EmptyState icon={PieChart} title="Nothing in this period" className="border-none py-8" />
      )}
    </ChartCard>
  );
}

/** Income report or expense report for one currency. */
export function FlowReport({
  report,
  kind,
  context,
}: {
  report: CurrencyReport;
  kind: "INCOME" | "EXPENSE";
  context: SeriesContext;
}) {
  const c = report.currency;
  const isIncome = kind === "INCOME";
  const word = isIncome ? "Income" : "Expenses";
  const total = isIncome ? report.totals.incomeMinor : report.totals.expenseMinor;
  const unit = GRANULARITY_UNIT[context.granularity];
  const points = toPoints(report, context.granularity, context.spansYears);
  return (
    <section className="flex flex-col gap-4" aria-label={`${word} in ${c}`}>
      <SectionHeading
        title={`${word} in ${c}: ${money(total, c)}`}
        description={`${context.range}. Transfers between your accounts are not included.`}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          className="lg:col-span-2"
          title={`${word} per ${unit}`}
          description={`${word} in ${c}, ${context.range}.`}
          table={
            <DataTable
              caption={`${word} per ${unit} in ${c}`}
              columns={[GRANULARITY_COLUMN[context.granularity], word]}
              rows={[
                ...points.map((p) => [p.title, isIncome ? p.incomeText : p.expenseText]),
                ["Total", money(total, c)],
              ]}
            />
          }
        >
          {total > 0n ? (
            <CashFlowChart
              points={points}
              series={isIncome ? "income" : "expense"}
              everyLabel={points.length <= 12}
              summary={`${word} per ${unit}, ${context.range}: total ${money(total, c)}.`}
            />
          ) : (
            <EmptyState
              icon={BarChart3}
              title={`No ${word.toLowerCase()} in this period`}
              className="border-none py-8"
            />
          )}
        </ChartCard>
        <BreakdownCard
          title={`${word} by category`}
          description={`Share of ${word.toLowerCase()} in ${c}.`}
          lines={report.byCategory[kind]}
          currency={c}
          label="Category"
        />
        <BreakdownCard
          title={`${word} by account`}
          description={`Which accounts the ${isIncome ? "money came into" : "money left"}.`}
          lines={report.byAccount[kind]}
          currency={c}
          label="Account"
        />
      </div>
    </section>
  );
}

/** Spending by category: expenses (and income) per category with counts and shares. */
export function CategoryReport({ report, range }: { report: CurrencyReport; range: string }) {
  const c = report.currency;
  const table = (kind: "INCOME" | "EXPENSE") => {
    const lines = report.byCategory[kind];
    const total = lines.reduce((s, l) => s + l.amountMinor, 0n);
    const word = kind === "EXPENSE" ? "Spending" : "Income";
    if (lines.length === 0) {
      return (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No {word.toLowerCase()} in this period.
        </p>
      );
    }
    return (
      <ReportTable
        caption={`${word} by category in ${c}, ${range}`}
        columns={[
          { label: "Category" },
          { label: "Records" },
          { label: "Amount" },
          { label: "Share" },
        ]}
        rows={lines.map((l) => [
          <span key="n" className="flex items-center gap-2">
            {l.color && (
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: `var(--${l.color})` }}
              />
            )}
            {l.name}
            {l.isArchived && <span className="text-xs text-muted-foreground">(archived)</span>}
          </span>,
          formatInteger(l.count),
          money(l.amountMinor, c),
          `${formatPercent(l.sharePercent)}`,
        ])}
        footer={[
          "Total",
          formatInteger(lines.reduce((s, l) => s + l.count, 0)),
          money(total, c),
          "100%",
        ]}
      />
    );
  };
  return (
    <section className="flex flex-col gap-4" aria-label={`Categories in ${c}`}>
      <SectionHeading title={`Spending by category · ${c}`} description={`${range}.`} />
      {table("EXPENSE")}
      <h3 className="text-base font-semibold">Income by category · {c}</h3>
      {table("INCOME")}
    </section>
  );
}

/** Cash flow: income, expenses and net per bucket, with a running net. */
export function CashFlowReport({
  report,
  context,
}: {
  report: CurrencyReport;
  context: SeriesContext;
}) {
  const c = report.currency;
  const unit = GRANULARITY_UNIT[context.granularity];
  const points = toPoints(report, context.granularity, context.spansYears);
  const runningNet = report.series.reduce<bigint[]>(
    (acc, p) => [...acc, (acc.at(-1) ?? 0n) + p.netMinor],
    [],
  );
  const hasActivity = report.totals.incomeMinor > 0n || report.totals.expenseMinor > 0n;
  return (
    <section className="flex flex-col gap-4" aria-label={`Cash flow in ${c}`}>
      <SectionHeading
        title={`Cash flow · ${c}`}
        description={`Income − expenses per ${unit}, ${context.range}. Transfers move money between your own accounts and are counted separately.`}
      />
      <ChartCard title="Income vs expenses" description={`Per ${unit}, in ${c}.`}>
        {hasActivity ? (
          <CashFlowChart
            points={points}
            everyLabel={points.length <= 12}
            summary={`Income ${money(report.totals.incomeMinor, c)} and expenses ${money(report.totals.expenseMinor, c)}, ${context.range}.`}
          />
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No income or expenses in this period"
            className="border-none py-8"
          />
        )}
      </ChartCard>
      <ReportTable
        caption={`Cash flow per ${unit} in ${c}`}
        tall
        columns={[
          { label: GRANULARITY_COLUMN[context.granularity] },
          { label: "Income" },
          { label: "Expenses" },
          { label: "Net" },
          { label: "Running net" },
          { label: "Transfers" },
        ]}
        rows={report.series.map((p, i) => {
          return [
            bucketTitle(p.start, context.granularity),
            money(p.incomeMinor, c),
            money(p.expenseMinor, c),
            signedMoney(p.netMinor, c),
            signedMoney(runningNet[i] ?? 0n, c),
            formatInteger(p.transferCount),
          ];
        })}
        footer={[
          "Total",
          money(report.totals.incomeMinor, c),
          money(report.totals.expenseMinor, c),
          signedMoney(report.totals.netMinor, c),
          "",
          formatInteger(report.series.reduce((s, p) => s + p.transferCount, 0)),
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Account history                                                            */
/* ------------------------------------------------------------------------- */

export function AccountHistoryReport({
  history,
  range,
  today,
}: {
  history: AccountHistory;
  range: string;
  today: IsoDate;
}) {
  const { account } = history;
  const c = account.currency;
  const balanced =
    history.openingMinor + history.inMinor - history.outMinor === history.closingMinor;
  return (
    <section className="flex flex-col gap-4" aria-label={`History of ${account.name}`}>
      <SectionHeading
        title={`${account.name} · ${c}${account.isArchived ? " (archived)" : ""}`}
        description={`${range}. Balances are at the end of the day and include the opening balance.`}
      />
      <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card px-4 py-3 text-sm sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Opening balance</dt>
          <dd>
            <Money minor={history.openingMinor} currency={c} className="font-medium" />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Money in</dt>
          <dd className="font-medium tabular-nums">{signedMoney(history.inMinor, c)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Money out</dt>
          <dd className="font-medium tabular-nums">{signedMoney(-history.outMinor, c)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Closing balance</dt>
          <dd>
            <Money minor={history.closingMinor} currency={c} className="font-medium" />
          </dd>
        </div>
      </dl>
      {history.showsRunningBalance ? (
        <p className="text-xs text-muted-foreground">
          {balanced
            ? "Opening balance + money in − money out = closing balance."
            : "Opening + in − out differs from the closing balance — please report this."}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Type or category filters hide some records, so money in/out covers only the matching
          records and no running balance is shown.
        </p>
      )}
      {history.rows.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No records in this period"
          description="Choose another period or clear the filters."
        />
      ) : (
        <ReportTable
          caption={`Records on ${account.name}, ${range}`}
          columns={[
            { label: "Date" },
            { label: "Details", align: "left" },
            { label: "Amount" },
            ...(history.showsRunningBalance ? [{ label: "Balance" }] : []),
          ]}
          rows={history.rows.map((r) => [
            <Link
              key="d"
              href={`/transactions/${r.id}`}
              className="underline-offset-4 hover:underline"
            >
              {formatCalendarDate(r.occurredOn, today)}
            </Link>,
            <span key="t" className="flex flex-col">
              <span>
                {r.kind === "TRANSFER"
                  ? r.toAccount?.id === account.id
                    ? `Transfer from ${r.account.name}`
                    : `Transfer to ${r.toAccount?.name ?? "another account"}`
                  : (r.payee ?? r.category?.name ?? "")}
              </span>
              <span className="text-xs text-muted-foreground">
                {r.kind === "TRANSFER"
                  ? "Transfer"
                  : `${r.kind === "INCOME" ? "Income" : "Expense"} · ${r.category?.name ?? ""}`}
              </span>
            </span>,
            signedMoney(r.signedMinor, c),
            ...(r.balanceMinor !== null ? [money(r.balanceMinor, c)] : []),
          ])}
        />
      )}
      {history.truncated && (
        <p className="text-sm text-muted-foreground">
          Showing the first {formatInteger(history.rows.length)} of {formatInteger(history.count)}{" "}
          records. Totals above cover all of them; export CSV for the full list.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Budget performance                                                         */
/* ------------------------------------------------------------------------- */

export function BudgetReport({ performance }: { performance: BudgetPerformance }) {
  const withBudgets = performance.months.filter((m) => m.budgets.length > 0);
  if (withBudgets.length === 0) {
    return (
      <EmptyState
        icon={PieChart}
        title="No budgets in this period"
        description="Set monthly limits on the Budgets page to track performance here."
        action={
          <Link href="/budgets" className="text-sm font-medium underline underline-offset-4">
            Go to budgets
          </Link>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {withBudgets.map((m) => (
        <section key={m.month} className="flex flex-col gap-3" aria-label={monthLabel(m.month)}>
          <h2 className="text-lg font-semibold">{monthLabel(m.month)}</h2>
          <ReportTable
            caption={`Budget performance, ${monthLabel(m.month)}`}
            columns={[
              { label: "Category" },
              { label: "Limit" },
              { label: "Spent" },
              { label: "Remaining" },
              { label: "Used" },
              { label: "Status", align: "left" },
            ]}
            rows={m.budgets.map((b) => [
              `${b.category.name} · ${b.currency}${b.isArchived ? " (archived budget)" : ""}`,
              money(b.limitMinor, b.currency),
              money(b.spentMinor, b.currency),
              signedMoney(b.remainingMinor, b.currency),
              b.usagePercent === null ? "—" : `${b.usagePercent}%`,
              <BudgetStatusLabel key="s" status={b.status} />,
            ])}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {m.totals.map((t) => (
              <p key={t.currency}>
                {t.currency}: spent {money(t.spentMinor, t.currency)} of{" "}
                {money(t.limitMinor, t.currency)}
                {t.usagePercent !== null && ` (${t.usagePercent}%)`} · {t.overCount} over budget
              </p>
            ))}
          </div>
        </section>
      ))}
      {performance.truncated && (
        <p className="text-sm text-muted-foreground">
          Showing the latest 12 months of the range. Choose a shorter range to see earlier months.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Period-over-period comparison                                              */
/* ------------------------------------------------------------------------- */

/** Change in words and signs: "+12.5%", "−3.0%", "New" (nothing before), "No change". */
function changePercent(current: bigint, previous: bigint): string {
  if (current === previous) return "No change";
  if (previous === 0n) return "New";
  const scaled = ((current - previous) * 2000n) / (previous < 0n ? -previous : previous);
  const tenths = scaled >= 0n ? (scaled + 1n) / 2n : (scaled - 1n) / 2n;
  const value = Number(tenths) / 10;
  return `${value > 0 ? "+" : "−"}${formatPercent(Math.abs(value))}`;
}

function ChangeCell({
  current,
  previous,
  currency,
}: {
  current: bigint;
  previous: bigint;
  currency: CurrencyCode;
}) {
  const diff = current - previous;
  const Icon = diff > 0n ? ArrowUpRight : diff < 0n ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center justify-end gap-1">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      {signedMoney(diff, currency)}
    </span>
  );
}

function comparisonRows(lines: ComparisonLine[], currency: CurrencyCode) {
  return lines.map((l) => [
    `${l.name}${l.isArchived ? " (archived)" : ""}`,
    money(l.currentMinor, currency),
    money(l.previousMinor, currency),
    <ChangeCell key="c" current={l.currentMinor} previous={l.previousMinor} currency={currency} />,
    changePercent(l.currentMinor, l.previousMinor),
  ]);
}

export function ComparisonReport({
  comparison,
  currentLabel,
  previousLabel,
}: {
  comparison: Comparison;
  currentLabel: string;
  previousLabel: string;
}) {
  const columns = [
    { label: "" },
    { label: "This period" },
    { label: "Previous period" },
    { label: "Change" },
    { label: "Change %" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">This period:</span> {currentLabel}.{" "}
        <span className="font-medium text-foreground">Previous period:</span> {previousLabel}.
      </p>
      {comparison.currencies.map((cc) => {
        const c = cc.currency;
        return (
          <section key={c} className="flex flex-col gap-3" aria-label={`Comparison in ${c}`}>
            <h2 className="text-lg font-semibold">Totals · {c}</h2>
            <ReportTable
              caption={`Totals compared in ${c}`}
              columns={[{ label: "Measure" }, ...columns.slice(1)]}
              rows={[
                ...(
                  [
                    ["Income", cc.current.incomeMinor, cc.previous.incomeMinor],
                    ["Expenses", cc.current.expenseMinor, cc.previous.expenseMinor],
                    ["Net", cc.current.netMinor, cc.previous.netMinor],
                  ] as const
                ).map(([label, cur, prev]) => [
                  label,
                  label === "Net" ? signedMoney(cur, c) : money(cur, c),
                  label === "Net" ? signedMoney(prev, c) : money(prev, c),
                  <ChangeCell key="c" current={cur} previous={prev} currency={c} />,
                  changePercent(cur, prev),
                ]),
                [
                  "Records",
                  formatInteger(cc.current.count),
                  formatInteger(cc.previous.count),
                  `${cc.current.count - cc.previous.count >= 0 ? "+" : "−"}${Math.abs(cc.current.count - cc.previous.count)}`,
                  changePercent(BigInt(cc.current.count), BigInt(cc.previous.count)),
                ],
              ]}
            />
            {cc.expenseCategories.length > 0 && (
              <>
                <h3 className="text-base font-semibold">Spending by category · {c}</h3>
                <ReportTable
                  caption={`Spending by category compared in ${c}`}
                  columns={[{ label: "Category" }, ...columns.slice(1)]}
                  rows={comparisonRows(cc.expenseCategories, c)}
                />
              </>
            )}
            {cc.incomeCategories.length > 0 && (
              <>
                <h3 className="text-base font-semibold">Income by category · {c}</h3>
                <ReportTable
                  caption={`Income by category compared in ${c}`}
                  columns={[{ label: "Category" }, ...columns.slice(1)]}
                  rows={comparisonRows(cc.incomeCategories, c)}
                />
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
