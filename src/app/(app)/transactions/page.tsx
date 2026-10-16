import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Plus, SearchX } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { getAccountsOverview } from "@/features/accounts/server/service";
import { listCategories } from "@/features/categories/server/service";
import { LedgerFilters } from "@/features/transactions/components/ledger-filters";
import { LedgerList } from "@/features/transactions/components/ledger-list";
import { LedgerPagination } from "@/features/transactions/components/ledger-pagination";
import { NewTransactionShortcut } from "@/features/transactions/components/new-transaction-shortcut";
import { PAGE_SIZE } from "@/features/transactions/constants";
import { ledgerFiltersSchema } from "@/features/transactions/schemas";
import { getLedgerPage } from "@/features/transactions/server/service";
import { activeFilterCount, ledgerHref } from "@/features/transactions/url";
import { todayInTimeZone } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const user = await requirePageUser();
  const filters = ledgerFiltersSchema.parse(await searchParams);
  const [ledger, overview, categories] = await Promise.all([
    getLedgerPage(user, filters),
    getAccountsOverview(user),
    listCategories(user),
  ]);
  const today = todayInTimeZone(user.timezone);
  const filtered = activeFilterCount(filters) > 0;
  const accounts = [...overview.active, ...overview.archived];
  const hasAccounts = overview.active.length > 0;
  const nothingYet = ledger.total === 0 && !filtered;

  const addHref = filters.accountId
    ? `/transactions/new?accountId=${filters.accountId}`
    : "/transactions/new";
  const addButton = (
    <Button asChild>
      <Link href={addHref}>
        <Plus aria-hidden="true" />
        Add transaction
      </Link>
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Transactions"
        description="Money in, money out and transfers between your accounts."
        actions={
          hasAccounts && !nothingYet ? (
            <div className="hidden md:block">{addButton}</div>
          ) : undefined
        }
      />
      {hasAccounts && <NewTransactionShortcut href={addHref} />}

      {!hasAccounts && nothingYet ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Add an account first"
          description="Transactions belong to an account — cash, a bank account or a wallet. Add one to start recording."
          action={
            <Button asChild>
              <Link href="/accounts/new">Add an account</Link>
            </Button>
          }
        />
      ) : nothingYet ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Record your first transaction"
          description="Add an expense, some income, or a transfer between your accounts. Your balances update straight away."
          action={addButton}
        />
      ) : (
        <>
          <LedgerFilters
            key={JSON.stringify(filters)}
            filters={filters}
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

          {ledger.summary.length > 0 && (
            <section aria-labelledby="summary-heading" className="flex flex-col gap-2">
              <h2 id="summary-heading" className="sr-only">
                Totals for these transactions
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {ledger.summary.map((s) => (
                  <dl
                    key={s.currency}
                    className="grid grid-cols-3 gap-2 rounded-xl border bg-card px-4 py-3 text-sm"
                  >
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">Income · {s.currency}</dt>
                      <dd>
                        <Money
                          minor={s.incomeMinor}
                          currency={s.currency}
                          tone="income"
                          className="font-medium"
                        />
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">Expenses · {s.currency}</dt>
                      <dd>
                        <Money
                          minor={s.expenseMinor}
                          currency={s.currency}
                          tone="expense"
                          className="font-medium"
                        />
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">Net · {s.currency}</dt>
                      <dd>
                        <Money minor={s.netMinor} currency={s.currency} className="font-medium" />
                      </dd>
                    </div>
                  </dl>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {filtered ? "Totals for every matching record" : "Totals for all records"},
                including upcoming ones. Transfers are not income or expenses.
              </p>
            </section>
          )}

          {ledger.items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matching transactions"
              description="Try a different search, or clear the filters to see everything."
              action={
                <Button asChild variant="outline">
                  <Link href={ledgerHref({ sort: filters.sort })}>Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <section aria-labelledby="list-heading" className="flex flex-col gap-3">
              <h2 id="list-heading" className="sr-only">
                Transactions
              </h2>
              <LedgerList items={ledger.items} today={today} />
              <LedgerPagination
                filters={filters}
                page={ledger.page}
                pageCount={ledger.pageCount}
                total={ledger.total}
                pageSize={PAGE_SIZE}
              />
            </section>
          )}
        </>
      )}

      {hasAccounts && !nothingYet && (
        // Phones: a floating "add" button above the bottom navigation (spacer keeps the last row reachable).
        <div className="h-16 md:hidden" aria-hidden="true" />
      )}
      {hasAccounts && !nothingYet && (
        <Link
          href={addHref}
          aria-label="Add transaction"
          className="fixed right-4 bottom-[calc(var(--spacing-bottom-nav,4rem)+env(safe-area-inset-bottom)+1rem)] z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:hidden"
        >
          <Plus className="size-6" aria-hidden="true" />
        </Link>
      )}
    </PageContainer>
  );
}
