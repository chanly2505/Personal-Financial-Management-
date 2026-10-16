import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionForm } from "@/features/transactions/components/transaction-form";
import { getTransactionFormData } from "@/features/transactions/server/form-data";
import { getRecord } from "@/features/transactions/server/service";
import { minorToDecimalString } from "@/lib/money";
import { requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit transaction" };

export default async function EditTransactionPage({
  params,
}: PageProps<"/transactions/[id]/edit">) {
  const user = await requirePageUser();
  const { id } = await params;
  const [record, data] = await Promise.all([
    getRecord(user, id).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getTransactionFormData(user),
  ]);

  const isTransfer = record.kind === "TRANSFER";
  const frozen = isTransfer
    ? record.fromAccount.isArchived ||
      record.toAccount.isArchived ||
      record.reversesTransferId !== null ||
      record.reversedByTransferId !== null
    : record.account.isArchived;
  // The details page explains why this record can't be edited.
  if (frozen) redirect(`/transactions/${record.id}`);

  const categories = { ...data.categories };
  if (!isTransfer && !categories[record.type].some((c) => c.id === record.category.id)) {
    // Keep the record's archived category selectable for this record only.
    categories[record.type] = [
      { id: record.category.id, name: record.category.name, isArchived: true },
      ...categories[record.type],
    ];
  }

  return (
    <PageContainer width="content">
      <PageHeader
        title="Edit transaction"
        breadcrumbs={[
          { label: "Transactions", href: "/transactions" },
          { label: "Details", href: `/transactions/${record.id}` },
          { label: "Edit" },
        ]}
      />
      <Card>
        <CardContent>
          <TransactionForm
            mode="edit"
            recordId={record.id}
            expectedUpdatedAt={record.updatedAt.toISOString()}
            accounts={data.accounts}
            categories={categories}
            minDate={data.minDate}
            maxDate={data.maxDate}
            defaults={
              isTransfer
                ? {
                    kind: "TRANSFER",
                    accountId: record.fromAccount.id,
                    toAccountId: record.toAccount.id,
                    categoryId: "",
                    amount: minorToDecimalString(record.amountMinor, record.currency),
                    occurredOn: record.occurredOn,
                    payee: "",
                    note: record.note ?? "",
                  }
                : {
                    kind: record.type,
                    accountId: record.account.id,
                    toAccountId: "",
                    categoryId: record.category.id,
                    amount: minorToDecimalString(record.amountMinor, record.currency),
                    occurredOn: record.occurredOn,
                    payee: record.payee ?? "",
                    note: record.note ?? "",
                  }
            }
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
