import { AlertTriangle, CheckCircle2, CircleAlert, OctagonAlert } from "lucide-react";

import { cn } from "@/lib/utils";

import { type BudgetStatus, STATUS_LABELS } from "../usage";

const STATUS_ICON = {
  on_track: CheckCircle2,
  warning: AlertTriangle,
  reached: CircleAlert,
  over: OctagonAlert,
  invalid: CircleAlert,
} as const;

const FILL: Record<BudgetStatus, string> = {
  on_track: "bg-chart-1",
  warning: "bg-warning",
  reached: "bg-warning",
  over: "bg-destructive",
  invalid: "bg-muted-foreground",
};

/** Status as icon + words (never colour alone). Neutral for "on track". */
export function BudgetStatusLabel({
  status,
  className,
}: {
  status: BudgetStatus;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        status === "on_track" && "text-muted-foreground",
        (status === "warning" || status === "reached") && "text-warning",
        (status === "over" || status === "invalid") && "text-destructive",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Usage bar. The fill is capped at the track's end; overspending shows as a
 * full bar with a striped overflow pattern plus the real percentage in text.
 * A tick marks the warning threshold. Screen readers get a meter with a
 * complete text value.
 */
export function BudgetProgress({
  usagePercent,
  status,
  thresholdPercent,
  valueText,
}: {
  usagePercent: number | null;
  status: BudgetStatus;
  thresholdPercent: number;
  /** e.g. "85% used, $30.00 left" */
  valueText: string;
}) {
  const shown = Math.min(Math.max(usagePercent ?? 0, 0), 100);
  return (
    <div
      role="meter"
      aria-label="Budget used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-valuetext={valueText}
      className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          FILL[status],
          status === "over" &&
            "bg-[repeating-linear-gradient(135deg,var(--destructive)_0_6px,color-mix(in_oklch,var(--destructive)_70%,white)_6px_9px)]",
        )}
        style={{ width: `${shown}%` }}
      />
      {thresholdPercent < 100 && (
        <div
          aria-hidden="true"
          className="absolute top-0 h-full w-0.5 bg-foreground/40"
          style={{ left: `${thresholdPercent}%` }}
          title={`Warning at ${thresholdPercent}%`}
        />
      )}
    </div>
  );
}
