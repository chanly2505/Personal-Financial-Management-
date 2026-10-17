import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** One primary action, e.g. <Button>Add your first account</Button>. */
  action?: React.ReactNode;
  className?: string;
  /** 1 when the empty state is the whole page (e.g. not found); otherwise a section heading. */
  headingLevel?: 1 | 2 | 3;
}

/** Shown when a list or section has nothing to display yet. No illustrations. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1">
        <Heading className="text-base font-semibold">{title}</Heading>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
