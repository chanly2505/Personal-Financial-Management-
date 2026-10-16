"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";
import { NAV_ITEMS, isActivePath } from "./navigation";

/**
 * Tablet (md): icon rail with tooltips. Desktop (lg+): full sidebar with labels.
 * Hidden on phones, where MobileNav takes over.
 */
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-rail flex-col border-r bg-sidebar text-sidebar-foreground md:flex lg:w-sidebar">
      <div className="flex h-header items-center gap-2 px-4 lg:px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 focus-visible:outline-none max-lg:mx-auto"
        >
          <BrandMark />
          <span className="font-semibold tracking-tight max-lg:sr-only">{APP_NAME}</span>
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <li key={href}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 max-lg:justify-center max-lg:px-0",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon
                        className={cn("size-4 shrink-0", active && "text-sidebar-primary")}
                        aria-hidden="true"
                      />
                      <span className="max-lg:sr-only">{label}</span>
                    </Link>
                  </TooltipTrigger>
                  {/* Labels are visible at lg+, so the tooltip only matters on the rail. */}
                  <TooltipContent side="right" className="lg:hidden">
                    {label}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
