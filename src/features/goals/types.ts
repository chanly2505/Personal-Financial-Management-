import type { IsoDate } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";

import type { GoalProgress } from "./progress";

export interface GoalView extends GoalProgress {
  id: string;
  name: string;
  currency: CurrencyCode;
  targetMinor: bigint;
  targetDate: IsoDate | null;
  note: string | null;
  isArchived: boolean;
  updatedAt: Date;
  account: { id: string; name: string; isArchived: boolean } | null;
  savedMinor: bigint;
  contributionCount: number;
  /** Set when active goals earmark more than the linked account holds. */
  accountWarning: string | null;
}

export interface ContributionView {
  id: string;
  /** Positive = set aside, negative = taken back. */
  amountMinor: bigint;
  occurredOn: IsoDate;
  note: string | null;
}
