import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetForm } from "@/features/budgets/components/budget-form";
import { getBudgetFormData } from "@/features/budgets/server/form-data";
import { getBudget } from "@/features/budgets/server/service";
import { minorToDecimalString } from "@/lib/money";
import { requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit budget" };

export default async function EditBudgetPage({ params }: PageProps<"/budgets/[id]/edit">) {
  const user = await requirePageUser();
  const { id } = await params;
  const [budget, data] = await Promise.all([
    getBudget(user, id).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getBudgetFormData(user),
  ]);
  if (budget.isArchived) redirect(`/budgets?month=${budget.month}`);

  return (
    <PageContainer width="content">
      <PageHeader
        title="Edit budget"
        breadcrumbs={[
          { label: "Budgets", href: `/budgets?month=${budget.month}` },
          { label: "Edit" },
        ]}
      />
      <Card>
        <CardContent>
          <BudgetForm
            mode="edit"
            budgetId={budget.id}
            expectedUpdatedAt={budget.updatedAt.toISOString()}
            categoryName={budget.category.name}
            categories={data.categories}
            currencies={data.currencies}
            minMonth={data.minMonth}
            maxMonth={data.maxMonth}
            defaults={{
              categoryId: budget.category.id,
              currency: budget.currency,
              month: budget.month,
              amount: minorToDecimalString(budget.limitMinor, budget.currency),
              alertThresholdPercent: String(budget.alertThresholdPercent),
            }}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
