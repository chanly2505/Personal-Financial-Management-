import { CheckCircle2, Clock } from "lucide-react";

import { cn } from "@/lib/utils";

/** Progress toward a goal; achieved and overdue states use an icon and words, not colour alone. */
export function GoalProgressBar({
  percent,
  achieved,
  valueText,
}: {
  percent: number;
  achieved: boolean;
  valueText: string;
}) {
  const shown = Math.min(Math.max(percent, 0), 100);
  return (
    <div
      role="meter"
      aria-label="Saved toward goal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-valuetext={valueText}
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn("h-full rounded-full", achieved ? "bg-success" : "bg-chart-1")}
        style={{ width: `${shown}%` }}
      />
    </div>
  );
}

export function GoalStatus({ achieved, overdue }: { achieved: boolean; overdue: boolean }) {
  if (achieved) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        Achieved
      </span>
    );
  }
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
        <Clock className="size-3.5" aria-hidden="true" />
        Target date passed
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">In progress</span>;
}
