import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionForm } from "@/features/transactions/components/transaction-form";
import { LEDGER_KINDS, type LedgerKind } from "@/features/transactions/constants";
import { getTransactionFormData } from "@/features/transactions/server/form-data";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Add transaction" };

export default async function NewTransactionPage({ searchParams }: PageProps<"/transactions/new">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const data = await getTransactionFormData(user);
  const typeParam = typeof params.type === "string" ? params.type.toUpperCase() : "";
  const kind: LedgerKind = (LEDGER_KINDS as readonly string[]).includes(typeParam)
    ? (typeParam as LedgerKind)
    : "EXPENSE";
  // Only preselect an account that is one of the user's active accounts.
  const accountParam = typeof params.accountId === "string" ? params.accountId : "";
  const accountId = data.accounts.some((a) => a.id === accountParam)
    ? accountParam
    : (data.accounts[0]?.id ?? "");

  return (
    <PageContainer width="content">
      <PageHeader
        title="Add transaction"
        breadcrumbs={[{ label: "Transactions", href: "/transactions" }, { label: "Add" }]}
      />
      {data.accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Add an account first"
          description="Every transaction belongs to an account. Add your cash, bank account or wallet to start."
          action={
            <Button asChild>
              <Link href="/accounts/new">Add an account</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <TransactionForm
              mode="create"
              accounts={data.accounts}
              categories={data.categories}
              minDate={data.minDate}
              maxDate={data.maxDate}
              defaults={{ kind, accountId, occurredOn: data.today }}
            />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
