import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Download, Landmark, Wallet } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getAccountsOverview } from "@/features/accounts/server/service";
import { listCategories } from "@/features/categories/server/service";
import { rangeLabel } from "@/features/dashboard/format";
import { ReportFilters } from "@/features/reports/components/report-filters";
import {
  AccountHistoryReport,
  BudgetReport,
  CashFlowReport,
  CategoryReport,
  ComparisonReport,
  FlowReport,
  TotalsSummary,
} from "@/features/reports/components/report-sections";
import {
  GRANULARITY_LABELS,
  REPORT_LABELS,
  REPORT_PRESET_LABELS,
  REPORT_TABS,
} from "@/features/reports/constants";
import { reportFiltersSchema } from "@/features/reports/schemas";
import { getReport } from "@/features/reports/server/service";
import { reportExportHref, reportHref, reportLedgerHref } from "@/features/reports/url";
import { EXPORT_MAX_ROWS } from "@/features/transactions/constants";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { formatInteger } from "@/lib/format/number";

export const metadata: Metadata = { title: "Reports" };

const TAB_NOTES: Partial<Record<(typeof REPORT_TABS)[number], string>> = {
  budgets:
    "Budgets are monthly and count expenses on every account in their currency for the whole month, so only the currency and category filters apply.",
  compare: "Compared with the period just before, using the same filters.",
};

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requirePageUser();
  const filters = reportFiltersSchema.parse(await searchParams);
  const [report, overview, categories] = await Promise.all([
    getReport(user, filters),
    getAccountsOverview(user),
    listCategories(user),
  ]);
  const accounts = [...overview.active, ...overview.archived];

  if (accounts.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Reports" description="Income, spending and cash flow over time." />
        <EmptyState
          icon={Wallet}
          title="Nothing to report yet"
          description="Add an account and record some income or expenses, then come back for reports."
          action={
            <Button asChild>
              <Link href="/accounts/new">Add an account</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const { period } = report;
  const range = rangeLabel(period.from, period.to);
  const recordCount = report.totals.reduce((sum, t) => sum + t.count, 0);
  const context = {
    granularity: report.granularity,
    spansYears: period.from.slice(0, 4) !== period.to.slice(0, 4),
    range,
  };
  const tab = report.tab;
  const exportAction =
    recordCount === 0 ? null : recordCount <= EXPORT_MAX_ROWS ? (
      <Button asChild variant="outline">
        <a href={reportExportHref(period, filters)} download>
          <Download aria-hidden="true" />
          Export CSV
        </a>
      </Button>
    ) : (
      <p className="max-w-xs text-sm text-muted-foreground">
        Export is limited to {formatInteger(EXPORT_MAX_ROWS)} records — choose a shorter period.
      </p>
    );

  let body: React.ReactNode;
  if (tab === "account") {
    body = report.accountHistory ? (
      <AccountHistoryReport history={report.accountHistory} range={range} today={report.today} />
    ) : (
      <EmptyState
        icon={Landmark}
        title="Choose an account"
        description="Pick an account to see its records and running balance for the period."
        action={
          <ul className="flex flex-wrap justify-center gap-2">
            {accounts.map((a) => (
              <li key={a.id}>
                <Button asChild variant="outline" size="sm">
                  <Link href={reportHref(filters, { accountId: a.id })}>
                    {a.name} · {a.currency}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        }
      />
    );
  } else if (tab === "budgets") {
    body = report.budgets && <BudgetReport performance={report.budgets} />;
  } else if (tab === "compare") {
    body =
      report.comparison && report.comparison.currencies.length > 0 ? (
        <ComparisonReport
          comparison={report.comparison}
          currentLabel={range}
          previousLabel={rangeLabel(report.comparison.previous.from, report.comparison.previous.to)}
        />
      ) : (
        <EmptyState icon={BarChart3} title="Nothing to compare in either period" />
      );
  } else if (report.currencies.length === 0) {
    body = (
      <EmptyState
        icon={BarChart3}
        title="Nothing matches these filters"
        description="Choose another period, or reset the filters."
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-10">
        {report.currencies.map((c) =>
          tab === "income" ? (
            <FlowReport key={c.currency} report={c} kind="INCOME" context={context} />
          ) : tab === "expenses" ? (
            <FlowReport key={c.currency} report={c} kind="EXPENSE" context={context} />
          ) : tab === "categories" ? (
            <CategoryReport key={c.currency} report={c} range={range} />
          ) : (
            <CashFlowReport key={c.currency} report={c} context={context} />
          ),
        )}
      </div>
    );
  }

  return (
    <PageContainer className="group/reports">
      <PageHeader
        title="Reports"
        description="Income, spending and cash flow over time, from your recorded transactions."
        actions={exportAction}
      />

      <ReportFilters
        key={JSON.stringify(filters)}
        filters={filters}
        range={{ from: period.from, to: period.to }}
        rangeText={`${REPORT_PRESET_LABELS[period.preset]}: ${range}`}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
          isArchived: a.isArchived,
        }))}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          isArchived: c.isArchived,
        }))}
      />

      <nav aria-label="Reports" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex w-max gap-1 rounded-lg bg-muted p-1">
          {REPORT_TABS.map((t) => (
            <li key={t}>
              <Link
                href={reportHref(filters, { report: t })}
                scroll={false}
                aria-current={t === tab ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  t === tab
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {REPORT_LABELS[t]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* While new filters load, keep this report on screen, dimmed. */}
      <div className="flex flex-col gap-6 transition-opacity group-has-[[data-pending]]/reports:opacity-60">
        <section aria-labelledby="totals-heading" className="flex flex-col gap-2">
          <h2 id="totals-heading" className="sr-only">
            Totals for these filters
          </h2>
          {report.totals.length > 0 && <TotalsSummary totals={report.totals} />}
          <p className="text-xs text-muted-foreground">
            {range}
            {report.granularityAdjusted &&
              ` · grouped ${GRANULARITY_LABELS[report.granularity].toLowerCase()} (${GRANULARITY_LABELS[filters.granularity].toLowerCase()} would be too many rows)`}
            . Transfers are not income or expenses; each currency is totalled separately and never
            converted.{" "}
            {recordCount > 0 && (
              <Link
                href={reportLedgerHref(period, filters)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                View the {formatInteger(recordCount)} {recordCount === 1 ? "record" : "records"}
              </Link>
            )}
          </p>
          {TAB_NOTES[tab] && <p className="text-xs text-muted-foreground">{TAB_NOTES[tab]}</p>}
        </section>

        {body}
      </div>
    </PageContainer>
  );
}
