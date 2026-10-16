import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { LedgerFilters } from "../schemas";
import { ledgerHref } from "../url";

/** Previous / next links that keep the current filters. */
export function LedgerPagination({
  filters,
  page,
  pageCount,
  total,
  pageSize,
}: {
  filters: LedgerFilters;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {first}–{last} of {total}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <PageLink
            href={page > 1 ? ledgerHref(filters, { page: page - 1 }) : null}
            label="Previous page"
          >
            <ChevronLeft aria-hidden="true" />
            <span className="hidden sm:inline">Previous</span>
          </PageLink>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <PageLink
            href={page < pageCount ? ledgerHref(filters, { page: page + 1 }) : null}
            label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight aria-hidden="true" />
          </PageLink>
        </div>
      )}
    </nav>
  );
}

function PageLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <Button variant="outline" size="sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href} aria-label={label} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
