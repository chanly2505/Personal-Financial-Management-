import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RecurringForm } from "@/features/recurring/components/recurring-form";
import { getRecurring } from "@/features/recurring/server/service";
import { getTransactionFormData } from "@/features/transactions/server/form-data";
import { minorToDecimalString } from "@/lib/money";
import { requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit recurring transaction" };

export default async function EditRecurringPage({ params }: PageProps<"/recurring/[id]/edit">) {
  const user = await requirePageUser();
  const { id } = await params;
  const [{ rule }, data] = await Promise.all([
    getRecurring(user, id).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getTransactionFormData(user),
  ]);
  // Keep the rule's current (possibly archived) account and category selectable.
  const accounts = data.accounts.some((a) => a.id === rule.account.id)
    ? data.accounts
    : [
        {
          id: rule.account.id,
          name: `${rule.account.name} (archived)`,
          currency: rule.account.currency,
        },
        ...data.accounts,
      ];
  const categories = { ...data.categories };
  if (!categories[rule.type].some((c) => c.id === rule.category.id)) {
    categories[rule.type] = [
      { id: rule.category.id, name: `${rule.category.name} (archived)` },
      ...categories[rule.type],
    ];
  }

  return (
    <PageContainer width="content">
      <PageHeader
        title="Edit recurring transaction"
        breadcrumbs={[
          { label: "Recurring", href: "/recurring" },
          { label: rule.name, href: `/recurring/${rule.id}` },
          { label: "Edit" },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        Changes apply to dates not posted yet. Transactions already posted are not changed.
      </p>
      <Card>
        <CardContent>
          <RecurringForm
            mode="edit"
            ruleId={rule.id}
            expectedUpdatedAt={rule.updatedAt.toISOString()}
            accounts={accounts}
            categories={categories}
            today={data.today}
            defaults={{
              name: rule.name,
              type: rule.type,
              accountId: rule.account.id,
              categoryId: rule.category.id,
              amount: minorToDecimalString(rule.amountMinor, rule.currency),
              frequency: rule.frequency,
              interval: String(rule.interval),
              startOn: rule.startOn,
              endOn: rule.endOn ?? "",
              payee: rule.payee ?? "",
              description: rule.description ?? "",
            }}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
