import { cn } from "@/lib/utils";

export interface BarListItem {
  key: string;
  label: string;
  /** Secondary text under the label, e.g. "Archived". */
  hint?: string;
  /** Formatted value shown at the bar's end. */
  valueText: string;
  /** Chart geometry only; may be negative. */
  value: number;
  /** Identity swatch (a design token such as "chart-3"), shown beside the label. */
  swatch?: string | null;
}

/**
 * Horizontal bars for ranked, labelled amounts (spending by category, account
 * balances). Plain HTML: every label and value is real text, so it reads the
 * same for screen readers, zoom and print. One series → one bar colour; a
 * category's own colour appears only as a swatch beside its name. Negative
 * values (overdrawn accounts) grow left from a shared baseline.
 */
export function BarList({ items, label }: { items: BarListItem[]; label: string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 0);
  const hasNegative = items.some((i) => i.value < 0);
  return (
    <ul className="flex flex-col gap-3" aria-label={label}>
      {items.map((item) => {
        const width = max === 0 ? 0 : (Math.abs(item.value) / max) * 100;
        return (
          <li key={item.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {item.swatch !== undefined && (
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      background: item.swatch ? `var(--${item.swatch})` : "var(--muted-foreground)",
                    }}
                  />
                )}
                <span className="truncate">{item.label}</span>
                {item.hint && (
                  <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>
                )}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{item.valueText}</span>
            </div>
            <div
              aria-hidden="true"
              className={cn("flex h-2 rounded-full bg-muted", hasNegative && "justify-center")}
            >
              {hasNegative ? (
                <>
                  <div className="flex w-1/2 justify-end">
                    {item.value < 0 && (
                      <div
                        className="h-2 rounded-l-full bg-expense"
                        style={{ width: `${width}%` }}
                      />
                    )}
                  </div>
                  <div className="w-px bg-border" />
                  <div className="flex w-1/2">
                    {item.value > 0 && (
                      <div
                        className="h-2 rounded-r-full bg-chart-1"
                        style={{ width: `${width}%` }}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="h-2 rounded-full bg-chart-1" style={{ width: `${width}%` }} />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
