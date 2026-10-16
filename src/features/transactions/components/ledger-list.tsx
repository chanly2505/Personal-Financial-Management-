import Link from "next/link";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight } from "lucide-react";

import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { type IsoDate, formatCalendarDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { LedgerItem } from "../types";

const ICONS = { INCOME: ArrowDownLeft, EXPENSE: ArrowUpRight, TRANSFER: ArrowLeftRight } as const;
const ICON_TONE = {
  INCOME: "bg-income-muted text-income",
  EXPENSE: "bg-expense-muted text-expense",
  TRANSFER: "bg-transfer-muted text-transfer",
} as const;

export function ledgerTitle(item: LedgerItem): string {
  if (item.kind === "TRANSFER") {
    return item.note || `Transfer to ${item.toAccount?.name ?? "account"}`;
  }
  return item.payee || item.category?.name || (item.kind === "INCOME" ? "Income" : "Expense");
}

/**
 * Ledger rows, each linking to the record. With `accountId` (an account's own
 * history), transfers show as money in (+) or out (−) of that account.
 */
export function LedgerList({
  items,
  today,
  accountId,
}: {
  items: LedgerItem[];
  today: IsoDate;
  accountId?: string;
}) {
  return (
    <ul className="divide-y rounded-xl border bg-card" aria-label="Transactions">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        const incoming = item.kind === "TRANSFER" && item.toAccount?.id === accountId;
        const outgoing = item.kind === "TRANSFER" && accountId !== undefined && !incoming;
        const details =
          item.kind === "TRANSFER"
            ? `${item.account.name} → ${item.toAccount?.name ?? ""}`
            : [
                item.category?.name &&
                  `${item.category.name}${item.category.isArchived ? " (archived)" : ""}`,
                accountId ? null : item.account.name,
              ]
                .filter(Boolean)
                .join(" · ");
        return (
          <li key={item.id}>
            <Link
              href={`/transactions/${item.id}`}
              className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-5"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  ICON_TONE[item.kind],
                )}
                aria-hidden="true"
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{ledgerTitle(item)}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatCalendarDate(item.occurredOn, today)}</span>
                  <span className="sr-only">,</span>
                  <span className="truncate">{details}</span>
                  {item.occurredOn > today && <Badge variant="info">Upcoming</Badge>}
                </span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                {item.kind === "TRANSFER" ? (
                  <span className="text-sm font-medium amount text-transfer">
                    {incoming ? "+" : outgoing ? "−" : ""}
                    {formatMoney(item.amountMinor, item.currency)}
                  </span>
                ) : (
                  <Money
                    minor={item.amountMinor}
                    currency={item.currency}
                    tone={item.kind === "INCOME" ? "income" : "expense"}
                    className="text-sm font-medium"
                  />
                )}
                <span className="text-xs text-muted-foreground">
                  {item.kind === "TRANSFER"
                    ? incoming
                      ? "Transfer in"
                      : outgoing
                        ? "Transfer out"
                        : "Transfer"
                    : item.kind === "INCOME"
                      ? "Income"
                      : "Expense"}
                </span>
              </span>
              <ChevronRight
                className="hidden size-4 text-muted-foreground sm:block"
                aria-hidden="true"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
