import type { CurrencyCode } from "@/lib/money";

export const ACCOUNT_TYPES = ["CASH", "BANK", "DIGITAL_WALLET", "OTHER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: "Cash",
  BANK: "Bank account",
  DIGITAL_WALLET: "Digital wallet",
  OTHER: "Other",
};

export const ACCOUNT_NAME_MAX = 60;

/**
 * One-tap starting points on the create form. They only pre-fill the name,
 * type and currency — users can change everything, and any name is allowed.
 * No connection to these institutions exists or is implied.
 */
export const ACCOUNT_PRESETS: readonly {
  name: string;
  type: AccountType;
  currency: CurrencyCode;
}[] = [
  { name: "Cash", type: "CASH", currency: "USD" },
  { name: "Cash (riel)", type: "CASH", currency: "KHR" },
  { name: "ABA Bank", type: "BANK", currency: "USD" },
  { name: "ACLEDA Bank", type: "BANK", currency: "USD" },
  { name: "Wing", type: "DIGITAL_WALLET", currency: "USD" },
];
