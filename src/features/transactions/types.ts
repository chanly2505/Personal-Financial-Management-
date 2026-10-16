import type { IsoDate } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";

import type { EntryType, LedgerKind } from "./constants";

/** Transaction DTOs shared by services and UI. Amounts are positive minor units. */

export interface LedgerItem {
  id: string;
  kind: LedgerKind;
  amountMinor: bigint;
  /** The currency of the account (both accounts, for a transfer). */
  currency: CurrencyCode;
  occurredOn: IsoDate;
  payee: string | null;
  note: string | null;
  /** The account for income/expense; the source account for a transfer. */
  account: { id: string; name: string };
  category: { id: string; name: string; color: string | null; isArchived: boolean } | null;
  /** Destination account, for transfers only. */
  toAccount: { id: string; name: string } | null;
}

export interface CurrencySummary {
  currency: CurrencyCode;
  incomeMinor: bigint;
  expenseMinor: bigint;
  /** income − expense. Transfers never count. */
  netMinor: bigint;
}

export interface LedgerPage {
  items: LedgerItem[];
  total: number;
  page: number;
  pageCount: number;
  /** Totals over every record matching the filters (not just this page). */
  summary: CurrencySummary[];
}

export interface EntryDetail {
  kind: EntryType;
  id: string;
  type: EntryType;
  amountMinor: bigint;
  currency: CurrencyCode;
  occurredOn: IsoDate;
  payee: string | null;
  note: string | null;
  account: { id: string; name: string; isArchived: boolean };
  category: { id: string; name: string; color: string | null; isArchived: boolean };
  recurring: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransferDetail {
  kind: "TRANSFER";
  id: string;
  amountMinor: bigint;
  currency: CurrencyCode;
  occurredOn: IsoDate;
  note: string | null;
  fromAccount: { id: string; name: string; isArchived: boolean };
  toAccount: { id: string; name: string; isArchived: boolean };
  /** Set when this transfer undoes another. */
  reversesTransferId: string | null;
  /** Set when another transfer undoes this one. */
  reversedByTransferId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RecordDetail = EntryDetail | TransferDetail;
