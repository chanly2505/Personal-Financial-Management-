import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Target } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { GoalCard } from "@/features/goals/components/goal-card";
import { listGoals } from "@/features/goals/server/service";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Savings goals" };

export default async function GoalsPage() {
  const user = await requirePageUser();
  const { active, archived, today } = await listGoals(user);
  const addButton = (
    <Button asChild>
      <Link href="/goals/new">
        <Plus aria-hidden="true" />
        Add goal
      </Link>
    </Button>
  );
  return (
    <PageContainer>
      <PageHeader
        title="Savings goals"
        description="Targets you're saving toward. Setting money aside only earmarks it — your account balances don't change."
        actions={active.length + archived.length > 0 ? addButton : undefined}
      />
      {active.length + archived.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Start a savings goal"
          description="An emergency fund, a new phone, school fees — set a target and track what you put aside."
          action={addButton}
        />
      ) : (
        <>
          {active.length === 0 ? (
            <EmptyState
              title="No active goals"
              description="All your goals are archived. Add a new one or restore one."
            />
          ) : (
            <section aria-label="Active goals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((g) => (
                <GoalCard key={g.id} goal={g} today={today} />
              ))}
            </section>
          )}
          {archived.length > 0 && (
            <details className="flex flex-col gap-3">
              <summary className="cursor-pointer rounded-md text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
                Archived goals ({archived.length})
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {archived.map((g) => (
                  <GoalCard key={g.id} goal={g} today={today} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </PageContainer>
  );
}
