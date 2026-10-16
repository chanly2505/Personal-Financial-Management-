import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/** Route-level loading state: skeleton shaped like a page header and card grid. */
export default function Loading() {
  return (
    <PageContainer>
      <div role="status" aria-live="polite" className="flex flex-col gap-6">
        <span className="sr-only">Loading…</span>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </PageContainer>
  );
}
