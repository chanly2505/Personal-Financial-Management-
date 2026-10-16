import type { CurrencyCode } from "@/lib/money";

import type { AccountType } from "./constants";

/** Account DTOs shared by the server (service) and UI components. */

export interface AccountSummary {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  openingBalanceMinor: bigint;
  /** Records dated today or earlier. */
  balanceMinor: bigint;
  /** All records, including future-dated ones. */
  projectedBalanceMinor: bigint;
  isArchived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface CurrencyTotal {
  currency: CurrencyCode;
  balanceMinor: bigint;
  accountCount: number;
}

export interface AccountsOverview {
  active: AccountSummary[];
  archived: AccountSummary[];
  /** One total per currency, active accounts only. Never converted or combined. */
  totals: CurrencyTotal[];
}

export interface AccountDetail extends AccountSummary {
  /** Number of records referencing the account; > 0 means it can only be archived. */
  referenceCount: number;
}
