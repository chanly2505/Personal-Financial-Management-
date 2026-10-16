import { type IsoDate, formatCalendarDate, todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

import type { AlertMenuItem } from "./components/alerts-menu";
import { monthLabel } from "./month";
import type { BudgetAlertView } from "./types";

/** Budget warnings → header menu items (plain text, no colour-only meaning). */
export function toAlertMenuItems(
  alerts: BudgetAlertView[],
  timezone: string,
  today: IsoDate,
): AlertMenuItem[] {
  return alerts.map((a) => ({
    id: a.id,
    href: `/budgets?month=${a.month}`,
    over: a.thresholdPercent >= 100,
    isRead: a.isRead,
    title:
      a.thresholdPercent >= 100
        ? `${a.categoryName}: budget used up`
        : `${a.categoryName}: ${a.thresholdPercent}% of budget used`,
    detail: `${formatMoney(a.spentAtAlertMinor, a.currency)} of ${formatMoney(a.limitMinor, a.currency)} · ${monthLabel(a.month)}`,
    when: formatCalendarDate(todayInTimeZone(timezone, a.createdAt), today),
  }));
}
