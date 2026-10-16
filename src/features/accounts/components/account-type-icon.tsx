import { Banknote, Landmark, Smartphone, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

import type { AccountType } from "../constants";

const ICONS = {
  CASH: Banknote,
  BANK: Landmark,
  DIGITAL_WALLET: Smartphone,
  OTHER: Wallet,
} as const;

/** Decorative icon for an account type; always shown next to the type's text label. */
export function AccountTypeIcon({ type, className }: { type: AccountType; className?: string }) {
  const Icon = ICONS[type];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
