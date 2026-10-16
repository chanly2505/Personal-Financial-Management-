import type { EntryType } from "@/features/transactions/constants";
import type { IsoDate } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";

import type { Frequency, PauseReason } from "./constants";

export type RuleStatus = "ACTIVE" | "PAUSED" | "COMPLETED";

export interface RecurringRuleView {
  id: string;
  name: string;
  type: EntryType;
  amountMinor: bigint;
  currency: CurrencyCode;
  payee: string | null;
  description: string | null;
  frequency: Frequency;
  interval: number;
  startOn: IsoDate;
  endOn: IsoDate | null;
  scheduleText: string;
  /** Next date not yet posted (null when completed). */
  nextOccurrenceOn: IsoDate | null;
  status: RuleStatus;
  pauseReason: PauseReason | null;
  account: { id: string; name: string; currency: CurrencyCode; isArchived: boolean };
  category: { id: string; name: string; color: string | null; isArchived: boolean };
  updatedAt: Date;
}

/** A scheduled date that has not been posted yet. */
export interface UpcomingItem {
  ruleId: string;
  name: string;
  type: EntryType;
  amountMinor: bigint;
  currency: CurrencyCode;
  date: IsoDate;
  /** Due today or earlier: posts on the next scheduler run. */
  due: boolean;
}

export interface RunView {
  id: string;
  occurrenceOn: IsoDate;
  status: "POSTED" | "FAILED" | "SKIPPED";
  transactionId: string | null;
  reason: string | null;
  attempts: number;
  lastAttemptAt: Date;
}
