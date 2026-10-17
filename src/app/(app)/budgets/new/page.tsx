import type { Metadata } from "next";
import Link from "next/link";
import { Tags } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetForm } from "@/features/budgets/components/budget-form";
import { isMonthKey } from "@/features/budgets/month";
import { getBudgetFormData } from "@/features/budgets/server/form-data";
import { isCurrencyCode } from "@/lib/money";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Add budget" };

export default async function NewBudgetPage({ searchParams }: PageProps<"/budgets/new">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const data = await getBudgetFormData(user);
  const param = (key: string) => (typeof params[key] === "string" ? params[key] : "");
  const month = isMonthKey(param("month")) ? param("month") : data.currentMonth;
  const categoryId = data.categories.some((c) => c.id === param("categoryId"))
    ? param("categoryId")
    : "";
  const currency = isCurrencyCode(param("currency")) ? param("currency") : data.defaultCurrency;

  return (
    <PageContainer width="content">
      <PageHeader
        title="Add budget"
        breadcrumbs={[{ label: "Budgets", href: `/budgets?month=${month}` }, { label: "Add" }]}
      />
      {data.categories.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No expense categories"
          description="Budgets are set per expense category. Add or restore one first."
          action={
            <Button asChild>
              <Link href="/categories">Manage categories</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <BudgetForm
              mode="create"
              categories={data.categories}
              currencies={data.currencies}
              minMonth={data.minMonth}
              maxMonth={data.maxMonth}
              defaults={{
                categoryId,
                currency: currency as "USD" | "KHR",
                month,
                alertThresholdPercent: String(data.defaultThreshold),
              }}
            />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
