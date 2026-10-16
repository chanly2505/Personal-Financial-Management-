import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Plus, Repeat } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RuleActions } from "@/features/recurring/components/rule-actions";
import {
  MAX_ATTEMPTS,
  PAUSE_REASON_LABELS,
  RUN_REASON_LABELS,
  STATUS_LABELS,
  UPCOMING_DAYS,
} from "@/features/recurring/constants";
import { listRecurring } from "@/features/recurring/server/service";
import type { RecurringRuleView } from "@/features/recurring/types";
import { type IsoDate, formatCalendarDate } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Recurring" };

function RuleRow({ rule, today }: { rule: RecurringRuleView; today: IsoDate }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5" aria-label={rule.name}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/recurring/${rule.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {rule.name}
          </Link>
          <Badge
            variant={
              rule.status === "ACTIVE"
                ? "outline"
                : rule.status === "PAUSED"
                  ? "warning"
                  : "secondary"
            }
          >
            {STATUS_LABELS[rule.status]}
          </Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {rule.scheduleText} · {rule.account.name} · {rule.category.name}
        </span>
        <span className="text-xs">
          {rule.status === "ACTIVE" && rule.nextOccurrenceOn && (
            <>Next: {formatCalendarDate(rule.nextOccurrenceOn, today)}</>
          )}
          {rule.status === "PAUSED" && rule.pauseReason && (
            <span className="text-warning">{PAUSE_REASON_LABELS[rule.pauseReason]}</span>
          )}
          {rule.status === "COMPLETED" && (
            <span className="text-muted-foreground">No more dates</span>
          )}
        </span>
      </div>
      <Money
        minor={rule.amountMinor}
        currency={rule.currency}
        tone={rule.type === "INCOME" ? "income" : "expense"}
        className="text-sm font-medium"
      />
      <RuleActions rule={{ id: rule.id, name: rule.name, status: rule.status }} />
    </li>
  );
}

export default async function RecurringPage() {
  const user = await requirePageUser();
  const { today, rules, upcoming, failures } = await listRecurring(user);
  const addButton = (
    <Button asChild>
      <Link href="/recurring/new">
        <Plus aria-hidden="true" />
        Add recurring
      </Link>
    </Button>
  );
  const groups = [
    { key: "ACTIVE", title: "Active" },
    { key: "PAUSED", title: "Paused" },
    { key: "COMPLETED", title: "Completed" },
  ] as const;

  return (
    <PageContainer>
      <PageHeader
        title="Recurring"
        description="Salary, rent, subscriptions and bills that repeat. Each date is posted as a real transaction when it arrives."
        actions={rules.length > 0 ? addButton : undefined}
      />

      {failures.length > 0 && (
        <section
          aria-labelledby="failures-heading"
          className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive-muted px-4 py-3"
        >
          <h2
            id="failures-heading"
            className="flex items-center gap-2 text-sm font-semibold text-destructive"
          >
            <AlertTriangle className="size-4" aria-hidden="true" />
            Some scheduled transactions could not be posted
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {failures.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/recurring/${f.ruleId}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {f.ruleName}
                </Link>{" "}
                ({formatCalendarDate(f.occurrenceOn)}):{" "}
                {RUN_REASON_LABELS[f.reason ?? ""] ?? "A problem occurred"}.{" "}
                {f.ruleStatus === "PAUSED"
                  ? `Paused after ${f.attempts} attempts — resume it to try again.`
                  : `Attempt ${f.attempts} of ${MAX_ATTEMPTS}; it will be retried on the next scheduled run.`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring transactions yet"
          description="Add your salary, rent or subscriptions once, and they're recorded for you on each date."
          action={addButton}
        />
      ) : (
        <>
          <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="upcoming-heading" className="text-lg font-semibold">
                Upcoming
              </h2>
              <p className="text-sm text-muted-foreground">
                Scheduled for the next {UPCOMING_DAYS} days — not posted yet, so not in your
                balances.
              </p>
            </div>
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing scheduled in the next {UPCOMING_DAYS} days.
              </p>
            ) : (
              <ul
                className="divide-y rounded-xl border border-dashed bg-card"
                aria-label="Upcoming scheduled transactions"
              >
                {upcoming.map((u) => (
                  <li
                    key={`${u.ruleId}-${u.date}`}
                    className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                  >
                    <CalendarClock
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{u.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCalendarDate(u.date, today)} ·{" "}
                        {u.due ? "Due — posts on the next scheduled run" : "Scheduled"}
                      </span>
                    </span>
                    <Money
                      minor={u.amountMinor}
                      currency={u.currency}
                      tone={u.type === "INCOME" ? "income" : "expense"}
                      className="text-sm text-muted-foreground"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {groups.map(({ key, title }) => {
            const own = rules.filter((r) => r.status === key);
            if (own.length === 0) return null;
            return (
              <section key={key} aria-labelledby={`${key}-heading`} className="flex flex-col gap-3">
                <h2 id={`${key}-heading`} className="text-lg font-semibold">
                  {title} ({own.length})
                </h2>
                <ul className="divide-y rounded-xl border bg-card">
                  {own.map((r) => (
                    <RuleRow key={r.id} rule={r} today={today} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </PageContainer>
  );
}
