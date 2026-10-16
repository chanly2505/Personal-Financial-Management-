import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { History } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountActions } from "@/features/accounts/components/account-actions";
import { AccountTypeIcon } from "@/features/accounts/components/account-type-icon";
import { ACCOUNT_TYPE_LABELS } from "@/features/accounts/constants";
import { getAccount } from "@/features/accounts/server/service";
import { getAccountActivity } from "@/features/transactions/server/service";
import { formatCalendarDate, todayInTimeZone } from "@/lib/dates";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Account" };

const KIND_LABEL = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
} as const;

export default async function AccountDetailPage({ params }: PageProps<"/accounts/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  // Unknown ids and other users' accounts are indistinguishable: both 404.
  const account = await getAccount(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const activity = await getAccountActivity(user, account.id);
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
              <dt className="text-muted-foreground">Opening balance</dt>
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
            description="Income, expenses and transfers for this account will appear here. Recording them arrives with the Transactions section."
          />
        ) : (
          <>
            <ul className="divide-y rounded-xl border bg-card">
              {activity.items.map((item) => {
                const tone =
                  item.kind === "INCOME"
                    ? "income"
                    : item.kind === "EXPENSE"
                      ? "expense"
                      : "transfer";
                const isTransfer = item.kind === "TRANSFER_IN" || item.kind === "TRANSFER_OUT";
                return (
                  <li
                    key={`${item.kind}-${item.id}`}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">
                        {item.description ||
                          (isTransfer
                            ? `Transfer ${item.kind === "TRANSFER_IN" ? "from" : "to"} ${item.label}`
                            : item.label)}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {formatCalendarDate(item.occurredOn, today)}
                        <Badge variant={tone}>{KIND_LABEL[item.kind]}</Badge>
                        {!isTransfer && (
                          <span>
                            {item.label}
                            {item.labelArchived && " (archived)"}
                          </span>
                        )}
                        {item.occurredOn > today && <Badge variant="info">Upcoming</Badge>}
                      </span>
                    </div>
                    {isTransfer ? (
                      <span className="text-sm font-medium amount text-transfer">
                        {item.kind === "TRANSFER_IN" ? "+" : "-"}
                        {formatMoney(item.amountMinor, account.currency)}
                      </span>
                    ) : (
                      <Money
                        minor={item.amountMinor}
                        currency={account.currency}
                        tone={tone === "income" ? "income" : "expense"}
                        className="text-sm font-medium"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {activity.hasMore && (
              <p className="text-xs text-muted-foreground">
                Showing the 50 most recent records. Full history with filters arrives with the
                Transactions section.
              </p>
            )}
          </>
        )}
      </section>
    </PageContainer>
  );
}
