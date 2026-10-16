import { Construction } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface PlannedFeatureProps {
  /** What the finished module will let the user do. */
  summary: string;
  /** Delivery phase from docs/IMPLEMENTATION_PLAN.md. */
  phase: number;
}

/**
 * Placeholder body for modules that are not built yet. It must be obvious to
 * anyone viewing the page that nothing here works yet — no fake data, no
 * disabled-looking controls that imply functionality.
 */
export function PlannedFeature({ summary, phase }: PlannedFeatureProps) {
  return (
    <section
      aria-labelledby="planned-feature-title"
      data-slot="planned-feature"
      className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-6"
    >
      <Badge variant="info">
        <Construction aria-hidden="true" />
        Not available yet
      </Badge>
      <h2 id="planned-feature-title" className="text-base font-semibold">
        This section is planned for phase {phase}
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">{summary}</p>
    </section>
  );
}
