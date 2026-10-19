"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, OctagonAlert, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { markAlertsReadAction } from "../actions";
import { t } from "@/i18n";
import { callAction } from "@/lib/action-result";

export interface AlertMenuItem {
  id: string;
  href: string;
  title: string;
  detail: string;
  when: string;
  over: boolean;
  isRead: boolean;
}

/**
 * In-app budget warnings (no email or push). The badge counts unread, still
 * applicable warnings; opening one marks it read.
 */
export function AlertsMenu({ unread, items }: { unread: number; items: AlertMenuItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const label = unread > 0 ? `Budget warnings, ${unread} unread` : "Budget warnings";

  function markRead(ids?: string[]) {
    startTransition(async () => {
      await callAction(() => markAlertsReadAction(ids ? { ids } : {}));
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className="relative">
          <Bell aria-hidden="true" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Budget warnings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No warnings. You&apos;re within your budgets.
          </p>
        ) : (
          items.map((item) => {
            const Icon = item.over ? OctagonAlert : AlertTriangle;
            return (
              <DropdownMenuItem key={item.id} asChild>
                <Link
                  href={item.href}
                  onClick={() => !item.isRead && markRead([item.id])}
                  className="flex items-start gap-2"
                >
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      item.over ? "text-destructive" : "text-warning",
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cn("text-sm", !item.isRead && "font-semibold")}>
                      {item.title}
                      {!item.isRead && <span className="sr-only"> {t("common.unread")}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.detail}</span>
                    <span className="text-xs text-muted-foreground">{item.when}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        {/* A menu item (not a button in the label) so arrow keys can reach it (UX-6). */}
        {unread > 0 && (
          <DropdownMenuItem className="justify-center text-sm" onSelect={() => markRead()}>
            Mark all read
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/budgets" className="justify-center text-sm">
            View budgets
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
