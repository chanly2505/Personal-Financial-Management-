import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "Savings goals" };

// Placeholder until this module's phase (see docs/IMPLEMENTATION_PLAN.md).
export default function Page() {
  return <ModulePlaceholder href="/goals" />;
}
