import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { GoalForm } from "@/features/goals/components/goal-form";
import { getGoalFormData } from "@/features/goals/server/form-data";
import { getGoal } from "@/features/goals/server/service";
import { minorToDecimalString } from "@/lib/money";
import { requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit goal" };

export default async function EditGoalPage({ params }: PageProps<"/goals/[id]/edit">) {
  const user = await requirePageUser();
  const { id } = await params;
  const [{ goal }, data] = await Promise.all([
    getGoal(user, id).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getGoalFormData(user),
  ]);
  const accounts =
    goal.account && !data.accounts.some((a) => a.id === goal.account!.id)
      ? [
          { id: goal.account.id, name: `${goal.account.name} (archived)`, currency: goal.currency },
          ...data.accounts,
        ]
      : data.accounts;
  return (
    <PageContainer width="content">
      <PageHeader
        title="Edit goal"
        breadcrumbs={[
          { label: "Savings goals", href: "/goals" },
          { label: goal.name, href: `/goals/${goal.id}` },
          { label: "Edit" },
        ]}
      />
      <Card>
        <CardContent>
          <GoalForm
            mode="edit"
            goalId={goal.id}
            expectedUpdatedAt={goal.updatedAt.toISOString()}
            currencyLocked={goal.contributionCount > 0}
            accounts={accounts}
            defaultCurrency={goal.currency}
            defaults={{
              name: goal.name,
              currency: goal.currency,
              target: minorToDecimalString(goal.targetMinor, goal.currency),
              targetDate: goal.targetDate ?? "",
              accountId: goal.account?.id ?? "none",
              note: goal.note ?? "",
            }}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
