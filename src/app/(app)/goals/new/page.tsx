import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { GoalForm } from "@/features/goals/components/goal-form";
import { getGoalFormData } from "@/features/goals/server/form-data";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Add savings goal" };

export default async function NewGoalPage() {
  const user = await requirePageUser();
  const data = await getGoalFormData(user);
  return (
    <PageContainer width="content">
      <PageHeader
        title="Add savings goal"
        breadcrumbs={[{ label: "Savings goals", href: "/goals" }, { label: "Add" }]}
      />
      <Card>
        <CardContent>
          <GoalForm mode="create" accounts={data.accounts} defaultCurrency={data.defaultCurrency} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
