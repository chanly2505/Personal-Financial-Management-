"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { NAV_ITEMS, isActivePath } from "./navigation";

const primary = NAV_ITEMS.filter((i) => i.primaryOnMobile);
const secondary = NAV_ITEMS.filter((i) => !i.primaryOnMobile);

const itemClass =
  "flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset";

/** Phone navigation: fixed bottom bar with four modules plus a "More" sheet. */
export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const secondaryActive = secondary.some((i) => isActivePath(pathname, i.href));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-bottom-nav">
        {primary.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(itemClass, active ? "text-primary" : "text-muted-foreground")}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              className={cn(
                itemClass,
                "cursor-pointer",
                secondaryActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Menu className="size-5" aria-hidden="true" />
              More
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
                <SheetDescription className="sr-only">Other sections of the app</SheetDescription>
              </SheetHeader>
              <ul className="grid gap-1 px-2 pb-4">
                {secondary.map(({ href, label, icon: Icon }) => {
                  const active = isActivePath(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-12 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          active ? "bg-accent text-foreground" : "text-foreground hover:bg-accent",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-5",
                            active ? "text-primary" : "text-muted-foreground",
                          )}
                          aria-hidden="true"
                        />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
