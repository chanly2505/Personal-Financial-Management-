import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";

import { ACCOUNT_TYPE_LABELS } from "../constants";
import type { AccountSummary } from "../types";
import { AccountTypeIcon } from "./account-type-icon";

/** Accounts as a list of tappable rows: name, type, currency and current balance. */
export function AccountList({ accounts }: { accounts: AccountSummary[] }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {accounts.map((account) => (
        <li key={account.id}>
          <Link
            href={`/accounts/${account.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors outline-none first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-5"
          >
            <AccountTypeIcon type={account.type} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{account.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {ACCOUNT_TYPE_LABELS[account.type]}
                <Badge variant="outline" className="px-1.5 py-0 text-[11px]">
                  {account.currency}
                </Badge>
                {account.isArchived && <Badge variant="secondary">Archived</Badge>}
              </span>
            </div>
            <Money
              minor={account.balanceMinor}
              currency={account.currency}
              className="text-sm font-medium sm:text-base"
            />
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
