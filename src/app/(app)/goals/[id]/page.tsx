import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContributionForm } from "@/features/goals/components/contribution-form";
import { GoalActions, RemoveContribution } from "@/features/goals/components/goal-actions";
import { GoalCard } from "@/features/goals/components/goal-card";
import { getGoal } from "@/features/goals/server/service";
import { formatCalendarDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Savings goal" };

export default async function GoalDetailPage({ params }: PageProps<"/goals/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  const { goal, contributions, today } = await getGoal(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  return (
    <PageContainer width="content">
      <PageHeader
        title={goal.name}
        breadcrumbs={[{ label: "Savings goals", href: "/goals" }, { label: goal.name }]}
        actions={
          <GoalActions goal={{ id: goal.id, name: goal.name, isArchived: goal.isArchived }} />
        }
      />
      {goal.isArchived && (
        <p className="rounded-lg border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
          This goal is archived. Its history is kept; restore it to set money aside again.
        </p>
      )}
      <GoalCard goal={goal} today={today} />
      {goal.note && <p className="text-sm text-muted-foreground">{goal.note}</p>}

      {!goal.isArchived && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Update savings</CardTitle>
            <CardDescription>
              Records money set aside for this goal. It does not move money or change any account
              balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContributionForm
              goalId={goal.id}
              currency={goal.currency}
              today={today}
              canWithdraw={goal.savedMinor > 0n}
            />
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="history-heading" className="flex flex-col gap-2">
        <h2 id="history-heading" className="text-lg font-semibold">
          History
        </h2>
        {contributions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing set aside yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card" aria-label="Savings history">
            {contributions.map((c) => {
              const positive = c.amountMinor > 0n;
              const label = `${positive ? "Set aside" : "Taken back"} ${formatMoney(positive ? c.amountMinor : -c.amountMinor, goal.currency)} on ${formatCalendarDate(c.occurredOn)}`;
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{positive ? "Set aside" : "Taken back"}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCalendarDate(c.occurredOn, today)}
                      {c.note && ` · ${c.note}`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      positive ? "text-income" : "text-expense",
                    )}
                  >
                    {positive ? "+" : "−"}
                    {formatMoney(positive ? c.amountMinor : -c.amountMinor, goal.currency)}
                  </span>
                  {!goal.isArchived && (
                    <RemoveContribution goalId={goal.id} contributionId={c.id} label={label} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
