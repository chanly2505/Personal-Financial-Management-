import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, OctagonAlert, PiggyBank, Plus, ReceiptText } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetActions } from "@/features/budgets/components/budget-actions";
import { BudgetProgress, BudgetStatusLabel } from "@/features/budgets/components/budget-progress";
import { CopyMonthButton } from "@/features/budgets/components/copy-month-button";
import { MonthNav } from "@/features/budgets/components/month-nav";
import { MIN_MONTH } from "@/features/budgets/constants";
import {
  type MonthKey,
  monthEnd,
  monthLabel,
  monthStart,
  shiftMonth,
} from "@/features/budgets/month";
import { budgetMonthParamSchema } from "@/features/budgets/schemas";
import { getBudgetMonth } from "@/features/budgets/server/service";
import type { BudgetView } from "@/features/budgets/types";
import { ledgerHref } from "@/features/transactions/url";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Budgets" };

function remainingText(b: Pick<BudgetView, "remainingMinor" | "currency">) {
  return b.remainingMinor >= 0n
    ? `${formatMoney(b.remainingMinor, b.currency)} left`
    : `Over by ${formatMoney(-b.remainingMinor, b.currency)}`;
}

function BudgetRow({ budget, month }: { budget: BudgetView; month: MonthKey }) {
  const label = `${budget.category.name} (${budget.currency})`;
  const usage = budget.usagePercent === null ? "—" : `${budget.usagePercent}%`;
  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:px-5" aria-label={label}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{
                background: budget.category.color
                  ? `var(--${budget.category.color})`
                  : "var(--muted-foreground)",
              }}
            />
            <Link
              href={ledgerHref({
                kind: "EXPENSE",
                categoryId: budget.category.id,
                from: monthStart(month),
                to: monthEnd(month),
              })}
              className="font-medium underline-offset-4 hover:underline"
            >
              {budget.category.name}
            </Link>
            <Badge variant="outline">{budget.currency}</Badge>
            {budget.category.isArchived && <Badge variant="secondary">Archived category</Badge>}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <BudgetStatusLabel status={budget.status} />
            <span className="text-xs text-muted-foreground">
              Warning at {budget.alertThresholdPercent}%
            </span>
          </span>
        </div>
        <BudgetActions
          budget={{ id: budget.id, label: budget.category.name, isArchived: budget.isArchived }}
        />
      </div>
      <BudgetProgress
        usagePercent={budget.usagePercent}
        status={budget.status}
        thresholdPercent={budget.alertThresholdPercent}
        valueText={`${usage} used, ${remainingText(budget)}`}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-medium tabular-nums">
          {formatMoney(budget.spentMinor, budget.currency)}{" "}
          <span className="font-normal text-muted-foreground">
            of {formatMoney(budget.limitMinor, budget.currency)} · {usage} used
          </span>
        </span>
        <span
          className={cn(
            "tabular-nums",
            budget.remainingMinor < 0n ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          {remainingText(budget)}
        </span>
      </div>
    </li>
  );
}

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  const user = await requirePageUser();
  const { month: requested } = budgetMonthParamSchema.parse(await searchParams);
  const data = await getBudgetMonth(user, requested);
  const { month } = data;
  const maxMonth = shiftMonth(data.currentMonth, 12);
  const previous = month > MIN_MONTH ? shiftMonth(month, -1) : null;
  const next = month < maxMonth ? shiftMonth(month, 1) : null;
  const addHref = `/budgets/new?month=${month}`;
  const addButton = (
    <Button asChild>
      <Link href={addHref}>
        <Plus aria-hidden="true" />
        Add budget
      </Link>
    </Button>
  );
  const multi = data.totals.length > 1;

  return (
    <PageContainer>
      <PageHeader
        title="Budgets"
        description="Monthly spending limits per category, counted from your actual expenses."
        actions={addButton}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <MonthNav
          month={month}
          label={monthLabel(month)}
          previous={previous}
          next={next}
          current={data.currentMonth}
          min={MIN_MONTH}
          max={maxMonth}
        />
        {data.copyableCount > 0 && <CopyMonthButton month={month} count={data.copyableCount} />}
      </div>

      {data.active.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title={`No budgets for ${monthLabel(month)}`}
          description={
            data.copyableCount > 0
              ? "Copy last month's budgets, or set a limit for a category."
              : "Set a monthly limit for a category, like Food and drinks, to see how much is left as you spend."
          }
          action={addButton}
        />
      ) : (
        <>
          <section aria-labelledby="totals-heading" className="flex flex-col gap-3">
            <h2 id="totals-heading" className="sr-only">
              Totals
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {data.totals
                .filter((t) => t.limitMinor > 0n)
                .map((t) => (
                  <Card key={t.currency} className="gap-2">
                    <CardHeader>
                      <CardDescription>
                        Budgeted in {CURRENCIES[t.currency].label.replace(/ \(.*\)$/, "")}
                      </CardDescription>
                      <CardTitle className="text-2xl">
                        <Money minor={t.spentMinor} currency={t.currency} />{" "}
                        <span className="text-base font-normal text-muted-foreground">
                          of {formatMoney(t.limitMinor, t.currency)}
                        </span>
                      </CardTitle>
                      <CardDescription
                        className={cn(t.remainingMinor < 0n && "font-medium text-destructive")}
                      >
                        {remainingText(t)}
                        {t.usagePercent !== null && ` · ${t.usagePercent}% used`}
                      </CardDescription>
                      {(t.overCount > 0 || t.warningCount > 0) && (
                        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          {t.overCount > 0 && (
                            <span className="inline-flex items-center gap-1 font-medium text-destructive">
                              <OctagonAlert className="size-3.5" aria-hidden="true" />
                              {t.overCount} over budget
                            </span>
                          )}
                          {t.warningCount > 0 && (
                            <span className="inline-flex items-center gap-1 font-medium text-warning">
                              <AlertTriangle className="size-3.5" aria-hidden="true" />
                              {t.warningCount} near or at the limit
                            </span>
                          )}
                        </p>
                      )}
                    </CardHeader>
                  </Card>
                ))}
            </div>
          </section>

          <section aria-labelledby="budgets-heading" className="flex flex-col gap-3">
            <h2 id="budgets-heading" className="text-lg font-semibold">
              Budgets
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {data.active.map((b) => (
                <BudgetRow key={b.id} budget={b} month={month} />
              ))}
            </ul>
          </section>
        </>
      )}

      <section aria-labelledby="spending-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="spending-heading" className="text-lg font-semibold">
            Spending by category
          </h2>
          <p className="text-sm text-muted-foreground">
            Every expense this month, budgeted or not. Transfers are not spending.
          </p>
        </div>
        {data.spending.length === 0 ? (
          <EmptyState icon={ReceiptText} title={`No expenses in ${monthLabel(month)}`} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.spending.map((group) => {
              const total = data.totals.find((t) => t.currency === group.currency);
              return (
                <Card key={group.currency}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {multi ? `In ${group.currency}` : "This month"}
                    </CardTitle>
                    {total && total.unbudgetedMinor > 0n && (
                      <CardDescription>
                        {formatMoney(total.unbudgetedMinor, group.currency)} spent in categories
                        without a budget.
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ul
                      className="flex flex-col divide-y text-sm"
                      aria-label={`Spending by category in ${group.currency}`}
                    >
                      {group.lines.map((line) => (
                        <li
                          key={line.categoryId}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="size-2.5 shrink-0 rounded-full"
                              style={{
                                background: line.color
                                  ? `var(--${line.color})`
                                  : "var(--muted-foreground)",
                              }}
                            />
                            <span className="truncate">{line.name}</span>
                            {line.budgetId ? (
                              <Badge variant="outline">Budgeted</Badge>
                            ) : (
                              !line.isArchived && (
                                <Link
                                  href={`/budgets/new?month=${month}&categoryId=${line.categoryId}&currency=${group.currency}`}
                                  className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
                                >
                                  Set budget
                                  <span className="sr-only"> for {line.name}</span>
                                </Link>
                              )
                            )}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatMoney(line.spentMinor, group.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {data.archived.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer rounded-md text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
            Archived budgets ({data.archived.length})
          </summary>
          <p className="mt-2 mb-3 text-xs text-muted-foreground">
            Hidden from this month&apos;s totals and warnings. Restore one to use it again.
          </p>
          <ul className="divide-y rounded-xl border bg-card">
            {data.archived.map((b) => (
              <BudgetRow key={b.id} budget={b} month={month} />
            ))}
          </ul>
        </details>
      )}
    </PageContainer>
  );
}
