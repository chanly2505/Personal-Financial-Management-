import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RecordActions } from "@/features/transactions/components/record-actions";
import { KIND_LABELS } from "@/features/transactions/constants";
import { getRecord } from "@/features/transactions/server/service";
import { formatCalendarDate, todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Transaction" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium sm:text-right">{children}</dd>
    </div>
  );
}

const accountLink = (a: { id: string; name: string; isArchived: boolean }) => (
  <Link href={`/accounts/${a.id}`} className="underline-offset-4 hover:underline">
    {a.name}
    {a.isArchived && " (archived)"}
  </Link>
);

export default async function TransactionDetailPage({ params }: PageProps<"/transactions/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  // Unknown ids and other users' records are indistinguishable: both 404.
  const record = await getRecord(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const today = todayInTimeZone(user.timezone);
  const isTransfer = record.kind === "TRANSFER";
  const archived = isTransfer
    ? record.fromAccount.isArchived || record.toAccount.isArchived
    : record.account.isArchived;
  const title = isTransfer
    ? `Transfer to ${record.toAccount.name}`
    : record.payee || record.category.name;
  const label = `${title} – ${formatMoney(record.amountMinor, record.currency)}`;
  const linked = isTransfer && (record.reversesTransferId || record.reversedByTransferId);

  return (
    <PageContainer width="content">
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: "Transactions", href: "/transactions" },
          { label: KIND_LABELS[record.kind] },
        ]}
        actions={
          <RecordActions
            record={{
              id: record.id,
              label,
              isTransfer,
              canEdit: !archived && !linked,
              canDelete: !archived && !(isTransfer && record.reversedByTransferId),
              canReverse: isTransfer && !archived && !linked,
              deleteHint:
                isTransfer && record.reversedByTransferId && !archived
                  ? "To delete this transfer, delete its reversal first."
                  : undefined,
            }}
          />
        }
      />

      {archived && (
        <p className="rounded-lg border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
          This record belongs to an archived account, so it can&apos;t be changed. Restore the
          account to edit or delete it.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                record.kind === "INCOME"
                  ? "income"
                  : record.kind === "EXPENSE"
                    ? "expense"
                    : "transfer"
              }
            >
              {KIND_LABELS[record.kind]}
            </Badge>
            {record.occurredOn > today && <Badge variant="info">Upcoming</Badge>}
            {isTransfer && record.reversesTransferId && <Badge variant="secondary">Reversal</Badge>}
            {isTransfer && record.reversedByTransferId && (
              <Badge variant="secondary">Reversed</Badge>
            )}
          </div>
          <p className="text-3xl font-semibold">
            {isTransfer ? (
              <span className="amount text-transfer">
                {formatMoney(record.amountMinor, record.currency)}
              </span>
            ) : (
              <Money
                minor={record.amountMinor}
                currency={record.currency}
                tone={record.kind === "INCOME" ? "income" : "expense"}
              />
            )}
          </p>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row label="Date">{formatCalendarDate(record.occurredOn, today)}</Row>
            {isTransfer ? (
              <>
                <Row label="From">{accountLink(record.fromAccount)}</Row>
                <Row label="To">{accountLink(record.toAccount)}</Row>
                {record.reversesTransferId && (
                  <Row label="Reverses">
                    <Link
                      href={`/transactions/${record.reversesTransferId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      Original transfer
                    </Link>
                  </Row>
                )}
                {record.reversedByTransferId && (
                  <Row label="Reversed by">
                    <Link
                      href={`/transactions/${record.reversedByTransferId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      Reversal transfer
                    </Link>
                  </Row>
                )}
              </>
            ) : (
              <>
                <Row label="Account">{accountLink(record.account)}</Row>
                <Row label="Category">
                  {record.category.name}
                  {record.category.isArchived && " (archived)"}
                </Row>
                {record.payee && (
                  <Row label={record.kind === "INCOME" ? "From" : "Paid to"}>{record.payee}</Row>
                )}
              </>
            )}
            <Row label="Currency">{record.currency}</Row>
            {record.note && (
              <Row label="Note">
                <span className="whitespace-pre-wrap">{record.note}</span>
              </Row>
            )}
            <Row label="Last changed">
              {formatCalendarDate(todayInTimeZone(user.timezone, record.updatedAt), today)}
            </Row>
          </dl>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
