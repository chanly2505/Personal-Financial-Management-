import { PlannedFeature } from "@/components/shared/planned-feature";

import { getNavItem } from "./navigation";
import { PageContainer } from "./page-container";
import { PageHeader } from "./page-header";

/**
 * Page body for a module that has not been built yet. Replace the route's
 * page with the real implementation when its phase starts, and delete this
 * usage — never extend a placeholder with fake content.
 */
export function ModulePlaceholder({ href }: { href: string }) {
  const item = getNavItem(href);
  return (
    <PageContainer>
      <PageHeader title={item.label} description={item.description} />
      <PlannedFeature phase={item.phase} summary={item.description} />
    </PageContainer>
  );
}
