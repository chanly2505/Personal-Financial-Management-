import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { formatCalendarDate, type IsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

import type { GoalView } from "../types";
import { GoalProgressBar, GoalStatus } from "./goal-progress-bar";

/** One goal's progress: saved of target, percent, status, monthly suggestion and warnings. */
export function GoalCard({ goal, today }: { goal: GoalView; today: IsoDate }) {
  const valueText = `${goal.percent}% saved, ${formatMoney(goal.savedMinor, goal.currency)} of ${formatMoney(goal.targetMinor, goal.currency)}`;
  return (
    <article
      aria-label={goal.name}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={`/goals/${goal.id}`}
            className="truncate font-medium underline-offset-4 hover:underline"
          >
            {goal.name}
          </Link>
          <GoalStatus achieved={goal.achieved} overdue={goal.overdue} />
        </div>
        <p className="shrink-0 text-right text-sm tabular-nums">
          <span className="font-semibold">{formatMoney(goal.savedMinor, goal.currency)}</span>
          <span className="block text-xs text-muted-foreground">
            of {formatMoney(goal.targetMinor, goal.currency)}
          </span>
        </p>
      </div>
      <GoalProgressBar percent={goal.percent} achieved={goal.achieved} valueText={valueText} />
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{goal.percent}% saved</span>
        {!goal.achieved && <span>{formatMoney(goal.remainingMinor, goal.currency)} to go</span>}
      </div>
      {(goal.targetDate || goal.account) && (
        <p className="text-xs text-muted-foreground">
          {goal.targetDate && <>By {formatCalendarDate(goal.targetDate, today)}</>}
          {goal.targetDate && goal.monthlyNeededMinor !== null && (
            <> · set aside {formatMoney(goal.monthlyNeededMinor, goal.currency)}/month</>
          )}
          {goal.targetDate && goal.account && " · "}
          {goal.account && <>Kept in {goal.account.name}</>}
        </p>
      )}
      {goal.accountWarning && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {goal.accountWarning}
        </p>
      )}
    </article>
  );
}
