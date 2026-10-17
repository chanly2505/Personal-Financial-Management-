import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RecurringForm } from "@/features/recurring/components/recurring-form";
import { getTransactionFormData } from "@/features/transactions/server/form-data";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Add recurring transaction" };

export default async function NewRecurringPage() {
  const user = await requirePageUser();
  const data = await getTransactionFormData(user);
  return (
    <PageContainer width="content">
      <PageHeader
        title="Add recurring transaction"
        breadcrumbs={[{ label: "Recurring", href: "/recurring" }, { label: "Add" }]}
      />
      {data.accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Add an account first"
          description="Recurring transactions are posted to one of your accounts."
          action={
            <Button asChild>
              <Link href="/accounts/new">Add an account</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <RecurringForm
              mode="create"
              accounts={data.accounts}
              categories={data.categories}
              today={data.today}
            />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
