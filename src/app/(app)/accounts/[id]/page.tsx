import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { History, Plus } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountActions } from "@/features/accounts/components/account-actions";
import { AccountTypeIcon } from "@/features/accounts/components/account-type-icon";
import { ACCOUNT_TYPE_LABELS } from "@/features/accounts/constants";
import { getAccount } from "@/features/accounts/server/service";
import { LedgerList } from "@/features/transactions/components/ledger-list";
import { ledgerFiltersSchema } from "@/features/transactions/schemas";
import { getLedgerPage } from "@/features/transactions/server/service";
import { ledgerHref } from "@/features/transactions/url";
import { formatCalendarDate, todayInTimeZone } from "@/lib/dates";
import { CURRENCIES } from "@/lib/money";
import { getCurrentUser, requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

/** The tab title is the record's name, like the page heading (falls back when not found). */
export async function generateMetadata({ params }: PageProps<"/accounts/[id]">): Promise<Metadata> {
  const [user, { id }] = await Promise.all([getCurrentUser(), params]);
  const account = user ? await getAccount(user, id).catch(() => null) : null;
  return { title: account?.name ?? "Account" };
}

const RECENT = 10;

export default async function AccountDetailPage({ params }: PageProps<"/accounts/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  // Unknown ids and other users' accounts are indistinguishable: both 404.
  const account = await getAccount(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const activity = await getLedgerPage(
    user,
    ledgerFiltersSchema.parse({ accountId: account.id }),
    RECENT,
  );
  const today = todayInTimeZone(user.timezone);
  const hasUpcoming = account.projectedBalanceMinor !== account.balanceMinor;
  const createdOn = formatCalendarDate(todayInTimeZone(user.timezone, account.createdAt));

  return (
    <PageContainer>
      <PageHeader
        title={account.name}
        description={`${ACCOUNT_TYPE_LABELS[account.type]} · ${CURRENCIES[account.currency].label}`}
        breadcrumbs={[{ label: "Accounts", href: "/accounts" }, { label: account.name }]}
        actions={
          <AccountActions
            account={{
              id: account.id,
              name: account.name,
              isArchived: account.isArchived,
              hasHistory: account.referenceCount > 0,
            }}
          />
        }
      />

      {account.isArchived && (
        <p className="rounded-lg border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
          This account is archived. It&apos;s hidden from your totals and can&apos;t be used for new
          records, but its history is kept. Restore it to use it again.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="gap-2 md:col-span-2">
          <CardHeader>
            <CardDescription>Current balance</CardDescription>
            <CardTitle className="text-3xl">
              <Money minor={account.balanceMinor} currency={account.currency} />
            </CardTitle>
            {hasUpcoming && (
              <CardDescription>
                Including upcoming records:{" "}
                <Money minor={account.projectedBalanceMinor} currency={account.currency} />
              </CardDescription>
            )}
          </CardHeader>
        </Card>
        <Card className="gap-3">
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-3">
              <AccountTypeIcon type={account.type} />
              <div className="flex flex-col">
                <span className="font-medium">{ACCOUNT_TYPE_LABELS[account.type]}</span>
                <span className="text-xs text-muted-foreground">Added {createdOn}</span>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-y-2">
              <dt className="text-muted-foreground">Starting balance</dt>
              <dd className="text-right">
                <Money minor={account.openingBalanceMinor} currency={account.currency} />
              </dd>
              <dt className="text-muted-foreground">Currency</dt>
              <dd className="text-right">{account.currency}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-lg font-semibold">
          History
        </h2>
        {activity.items.length === 0 ? (
          <EmptyState
            icon={History}
            title="No records yet"
            description="Income, expenses and transfers for this account will appear here."
            action={
              account.isArchived ? undefined : (
                <Button asChild>
                  <Link href={`/transactions/new?accountId=${account.id}`}>
                    <Plus aria-hidden="true" />
                    Add transaction
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <LedgerList items={activity.items} today={today} accountId={account.id} />
            <div className="flex flex-wrap items-center gap-2">
              {activity.total > RECENT && (
                <p className="text-xs text-muted-foreground">
                  Showing the {RECENT} most recent of {activity.total} records.
                </p>
              )}
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <Link href={ledgerHref({ accountId: account.id })}>View all in Transactions</Link>
              </Button>
              {!account.isArchived && (
                <Button asChild size="sm">
                  <Link href={`/transactions/new?accountId=${account.id}`}>
                    <Plus aria-hidden="true" />
                    Add transaction
                  </Link>
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </PageContainer>
  );
}
