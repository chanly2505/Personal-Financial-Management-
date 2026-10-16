import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Shown for unknown URLs and for records that do not exist or belong to
 * someone else (they are indistinguishable by design — docs/SECURITY.md §4).
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-content flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <EmptyState
        icon={SearchX}
        title="We couldn't find that page"
        description="The link may be broken, or the page may have been removed."
        action={
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    </main>
  );
}
