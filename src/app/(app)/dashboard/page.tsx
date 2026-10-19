import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, BarChart3, PieChart, Plus, TrendingUp, Wallet } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetProgress, BudgetStatusLabel } from "@/features/budgets/components/budget-progress";
import { monthLabel } from "@/features/budgets/month";
import { getCurrentMonthSummary } from "@/features/budgets/server/service";
import { GoalCard } from "@/features/goals/components/goal-card";
import { getGoalsSummary } from "@/features/goals/server/service";
import { BarList } from "@/features/dashboard/components/bar-list";
import { ChartCard, DataTable } from "@/features/dashboard/components/chart-card";
import { CashFlowChart, type ChartPoint, TrendChart } from "@/features/dashboard/components/charts";
import { PeriodPicker } from "@/features/dashboard/components/period-picker";
import { PERIOD_LABELS } from "@/features/dashboard/constants";
import { bucketLabel, bucketTitle, rangeLabel, toChartNumber } from "@/features/dashboard/format";
import { dashboardFiltersSchema } from "@/features/dashboard/schemas";
import { getDashboard } from "@/features/dashboard/server/service";
import type { CashFlowPoint, PeriodTotals } from "@/features/dashboard/types";
import { LedgerList } from "@/features/transactions/components/ledger-list";
import { ledgerHref } from "@/features/transactions/url";
import { CURRENCIES, type CurrencyCode, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { formatPercent } from "@/lib/format/number";

export const metadata: Metadata = { title: "Dashboard" };

const BUCKET_WORD = { day: "day", week: "week", month: "month" } as const;

function currencyName(currency: CurrencyCode) {
  return CURRENCIES[currency].label.replace(/ \(.*\)$/, "");
}

function toPoints(
  points: CashFlowPoint[],
  currency: CurrencyCode,
  bucket: "day" | "week" | "month",
  spansYears: boolean,
): ChartPoint[] {
  return points.map((p) => ({
    label: bucketLabel(p.start, bucket, spansYears),
    title: bucketTitle(p.start, bucket),
    income: toChartNumber(p.incomeMinor, currency),
    expense: toChartNumber(p.expenseMinor, currency),
    incomeText: formatMoney(p.incomeMinor, currency),
    expenseText: formatMoney(p.expenseMinor, currency),
  }));
}

function StatTile({
  label,
  children,
  note,
}: {
  label: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="gap-1 px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl font-semibold sm:text-2xl">{children}</CardTitle>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardHeader>
    </Card>
  );
}

function PeriodSummary({ totals, multi }: { totals: PeriodTotals; multi: boolean }) {
  const c = totals.currency;
  const suffix = multi ? ` · ${c}` : "";
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label={`Income${suffix}`}>
        <Money minor={totals.incomeMinor} currency={c} />
      </StatTile>
      <StatTile label={`Expenses${suffix}`}>
        <Money minor={totals.expenseMinor} currency={c} />
      </StatTile>
      <StatTile label={`Left over${suffix}`} note="Income − expenses">
        <Money minor={totals.netMinor} currency={c} />
      </StatTile>
      <StatTile
        label={`Share of income kept${suffix}`}
        note={
          totals.savingsRatePercent === null
            ? "No income in this period"
            : "Share of income not spent"
        }
      >
        {totals.savingsRatePercent === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn(totals.savingsRatePercent < 0 && "text-expense")}>
            {formatPercent(totals.savingsRatePercent)}
          </span>
        )}
      </StatTile>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requirePageUser();
  const filters = dashboardFiltersSchema.parse(await searchParams);
  const [d, budgets, goals] = await Promise.all([
    getDashboard(user, filters),
    getCurrentMonthSummary(user),
    getGoalsSummary(user),
  ]);
  const { period, charts } = d;
  const range = rangeLabel(period.from, period.to);
  const addButton = (
    <Button asChild>
      <Link href="/transactions/new">
        <Plus aria-hidden="true" />
        Add transaction
      </Link>
    </Button>
  );

  if (!d.hasAccounts) {
    return (
      <PageContainer>
        <PageHeader
          title="Dashboard"
          description="Your balances, income and spending at a glance."
        />
        <EmptyState
          icon={Wallet}
          title="Start by adding an account"
          description="Add your cash, a bank account like ABA or ACLEDA, or a wallet like Wing. Then record income and expenses to see your dashboard come to life."
          action={
            <Button asChild>
              <Link href="/accounts/new">Add an account</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const multi = d.currencies.length > 1;
  const zero = (currency: CurrencyCode): PeriodTotals => ({
    currency,
    incomeMinor: 0n,
    expenseMinor: 0n,
    netMinor: 0n,
    savingsRatePercent: null,
  });
  const periodTotals = d.currencies.map((c) => d.totals.find((t) => t.currency === c) ?? zero(c));
  const cc = d.chartCurrency;
  const chartTotals = periodTotals.find((t) => t.currency === cc) ?? zero(cc);
  const flowPoints = toPoints(
    charts.cashFlow,
    cc,
    period.bucket,
    period.from.slice(0, 4) !== period.to.slice(0, 4),
  );
  const trendPoints = toPoints(
    charts.trend,
    cc,
    "month",
    d.trendRange.from.slice(0, 4) !== d.trendRange.to.slice(0, 4),
  );
  const hasActivity = chartTotals.incomeMinor > 0n || chartTotals.expenseMinor > 0n;
  const hasTrend = charts.trend.some((p) => p.expenseMinor > 0n);
  const periodParams: Record<string, string> = {
    period: period.preset,
    ...(period.preset === "custom" ? { from: period.from, to: period.to } : {}),
  };
  const currencyHref = (currency: CurrencyCode) =>
    `/dashboard?${new URLSearchParams({ ...periodParams, currency }).toString()}`;
  const bucketWord = BUCKET_WORD[period.bucket];

  const currencySwitch = multi ? (
    <nav aria-label="Chart currency" className="flex gap-1 rounded-lg bg-muted p-1">
      {d.currencies.map((c) => (
        <Link
          key={c}
          href={currencyHref(c)}
          scroll={false}
          aria-current={c === cc ? "true" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            c === cc
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {c}
        </Link>
      ))}
    </nav>
  ) : null;

  return (
    <PageContainer className="group/dash">
      <PageHeader
        title="Dashboard"
        description="Your balances, income and spending at a glance."
        actions={<div className="hidden md:block">{addButton}</div>}
      />

      <section aria-labelledby="balances-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="balances-heading" className="text-lg font-semibold">
            Balances today
          </h2>
          <p className="text-sm text-muted-foreground">
            What your active accounts hold now. The period you choose below does not change these.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {d.balances.map((b) => (
            <ChartCard
              key={b.currency}
              title={`Total in ${currencyName(b.currency)}`}
              description={`${b.accountCount} active ${b.accountCount === 1 ? "account" : "accounts"}`}
            >
              <p className="text-3xl font-semibold">
                <Money minor={b.balanceMinor} currency={b.currency} />
              </p>
              <BarList
                label={`Account balances in ${b.currency}`}
                items={d.accounts
                  .filter((a) => a.currency === b.currency)
                  .map((a) => ({
                    key: a.id,
                    label: a.name,
                    value: toChartNumber(a.balanceMinor, a.currency),
                    valueText: formatMoney(a.balanceMinor, a.currency),
                  }))}
              />
            </ChartCard>
          ))}
          {d.balances.length === 0 && (
            <EmptyState
              headingLevel={3}
              icon={Wallet}
              title="No active accounts"
              description="Restore an archived account or add a new one."
            />
          )}
        </div>
      </section>

      <PeriodPicker
        preset={period.preset}
        from={period.from}
        to={period.to}
        currency={filters.currency}
        rangeText={`${PERIOD_LABELS[period.preset]}: ${range}`}
      />

      {/* While a new period loads, keep this view, dimmed (no skeleton flash). */}
      <div className="flex flex-col gap-8 transition-opacity group-has-[[data-pending]]/dash:opacity-60">
        <section aria-labelledby="period-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="period-heading" className="text-lg font-semibold">
              Income and spending
            </h2>
            <p className="text-sm text-muted-foreground">
              {range}. Transfers between your accounts are not counted.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {periodTotals.map((t) => (
              <PeriodSummary key={t.currency} totals={t} multi={multi} />
            ))}
          </div>
          {multi && (
            <p className="text-xs text-muted-foreground">
              Each currency is totalled separately and never converted.
            </p>
          )}
        </section>

        <section aria-labelledby="charts-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="charts-heading" className="text-lg font-semibold">
              {multi ? `Charts in ${currencyName(cc)}` : "Charts"}
            </h2>
            {currencySwitch}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ChartCard
              title="Income vs expenses"
              description={`Per ${bucketWord}, ${range}.`}
              table={
                hasActivity ? (
                  <DataTable
                    caption={`Income and expenses per ${bucketWord} in ${cc}`}
                    columns={[
                      period.bucket === "day"
                        ? "Date"
                        : period.bucket === "week"
                          ? "Week"
                          : "Month",
                      "Income",
                      "Expenses",
                    ]}
                    rows={flowPoints.map((p) => [p.title, p.incomeText, p.expenseText])}
                  />
                ) : undefined
              }
            >
              {hasActivity ? (
                <CashFlowChart
                  points={flowPoints}
                  everyLabel={period.bucket === "month" && flowPoints.length <= 12}
                  summary={`Income and expenses per ${bucketWord}, ${range}: income ${formatMoney(chartTotals.incomeMinor, cc)}, expenses ${formatMoney(chartTotals.expenseMinor, cc)}.`}
                />
              ) : (
                <EmptyState
                  headingLevel={3}
                  icon={BarChart3}
                  title="No income or expenses in this period"
                  description="Choose another period, or add a transaction."
                  className="border-none py-8"
                />
              )}
            </ChartCard>

            <ChartCard title="Spending by category" description={`Expenses in ${cc}, ${range}.`}>
              {charts.categories.length > 0 ? (
                <BarList
                  label="Spending by category"
                  items={charts.categories.map((c) => ({
                    key: c.categoryId ?? "other",
                    label: c.name,
                    hint: c.isArchived ? "Archived" : undefined,
                    swatch: c.color,
                    value: toChartNumber(c.amountMinor, cc),
                    valueText: `${formatMoney(c.amountMinor, cc)} · ${formatPercent(c.sharePercent)}`,
                  }))}
                />
              ) : (
                <EmptyState
                  headingLevel={3}
                  icon={PieChart}
                  title="No spending in this period"
                  className="border-none py-8"
                />
              )}
            </ChartCard>

            <ChartCard
              title="Monthly spending"
              description={`Expenses in ${cc} per month, ${rangeLabel(d.trendRange.from, d.trendRange.to)}.`}
              table={
                hasTrend ? (
                  <DataTable
                    caption={`Expenses per month in ${cc}`}
                    columns={["Month", "Expenses"]}
                    rows={trendPoints.map((p) => [p.title, p.expenseText])}
                  />
                ) : undefined
              }
            >
              {hasTrend ? (
                <TrendChart
                  points={trendPoints}
                  summary={`Expenses per month: ${trendPoints.map((p) => `${p.title} ${p.expenseText}`).join(", ")}.`}
                />
              ) : (
                <EmptyState
                  headingLevel={3}
                  icon={TrendingUp}
                  title="No spending in these months"
                  className="border-none py-8"
                />
              )}
            </ChartCard>

            <ChartCard
              title="Recent transactions"
              description={`Latest records, ${range}.`}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href={ledgerHref({ from: period.from, to: period.to })}>View all</Link>
                </Button>
              }
            >
              {d.recent.length > 0 ? (
                <LedgerList items={d.recent} today={d.today} />
              ) : (
                <EmptyState
                  headingLevel={3}
                  icon={ArrowLeftRight}
                  title="Nothing recorded in this period"
                  action={addButton}
                  className="border-none py-8"
                />
              )}
            </ChartCard>
          </div>
        </section>

        <section aria-labelledby="budgets-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h2 id="budgets-heading" className="text-lg font-semibold">
                Budgets in {monthLabel(budgets.month)}
              </h2>
              <p className="text-sm text-muted-foreground">
                This calendar month&apos;s limits — not affected by the period above.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/budgets">
                {budgets.budgetCount > 0 ? "View budgets" : "Set a budget"}
              </Link>
            </Button>
          </div>
          {budgets.budgetCount === 0 ? (
            <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              No budgets this month. Set monthly limits for categories to track your spending.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {budgets.currencies.map((c) => (
                <Card key={c.currency} className="gap-3 px-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Budgeted spending · {c.currency}
                    </p>
                    <p className="text-sm font-medium tabular-nums">
                      {formatMoney(c.spentMinor, c.currency)}{" "}
                      <span className="text-muted-foreground">
                        of {formatMoney(c.limitMinor, c.currency)}
                      </span>
                    </p>
                  </div>
                  <BudgetProgress
                    usagePercent={c.usagePercent}
                    // The combined bar is neutral unless the total itself is over;
                    // individual budgets are counted in words below.
                    status={c.spentMinor > c.limitMinor ? "over" : "on_track"}
                    thresholdPercent={100}
                    valueText={`${c.usagePercent ?? 0}% of ${c.currency} budgets used`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {c.overCount} over budget · {c.nearCount} near or at the limit
                  </p>
                </Card>
              ))}
              {budgets.attention.length > 0 && (
                <Card className="gap-2 px-6 lg:col-span-2">
                  <p className="text-sm font-medium">Needs attention</p>
                  <ul className="flex flex-col divide-y text-sm">
                    {budgets.attention.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">
                            {b.category.name} · {b.currency}
                          </span>
                          <BudgetStatusLabel status={b.status} />
                        </span>
                        <span className="text-right tabular-nums">
                          {b.usagePercent ?? 0}%
                          <span className="block text-xs text-muted-foreground">
                            {formatMoney(b.spentMinor, b.currency)} of{" "}
                            {formatMoney(b.limitMinor, b.currency)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="goals-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h2 id="goals-heading" className="text-lg font-semibold">
                Savings goals
              </h2>
              <p className="text-sm text-muted-foreground">
                Money set aside so far. Your account balances don&apos;t change.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/goals">
                {goals.total > 0 ? `View all (${goals.total})` : "Add a goal"}
              </Link>
            </Button>
          </div>
          {goals.total === 0 ? (
            <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              No savings goals yet. Set a target, like an emergency fund, and track your progress.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {goals.goals.map((g) => (
                <GoalCard key={g.id} goal={g} today={goals.today} />
              ))}
            </div>
          )}
        </section>
      </div>

      <Link
        href="/transactions/new"
        aria-label="Add transaction"
        className="fixed right-4 bottom-[calc(var(--spacing-bottom-nav,4rem)+env(safe-area-inset-bottom)+1rem)] z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:hidden"
      >
        <Plus className="size-6" aria-hidden="true" />
      </Link>
      <div className="h-16 md:hidden" aria-hidden="true" />
    </PageContainer>
  );
}
