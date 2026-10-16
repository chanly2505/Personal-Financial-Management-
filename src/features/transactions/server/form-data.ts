import "server-only";

import { getAccountsOverview } from "@/features/accounts/server/service";
import { listSelectableCategories } from "@/features/categories/server/service";
import { type IsoDate, addDays, todayInTimeZone } from "@/lib/dates";
import type { CurrentUser } from "@/server/auth/session";

import { MAX_DAYS_AHEAD, MIN_OCCURRED_ON } from "../constants";

/** Everything the transaction form needs: active accounts, active categories, date bounds. */
export async function getTransactionFormData(user: Pick<CurrentUser, "id" | "timezone">) {
  const [overview, income, expense] = await Promise.all([
    getAccountsOverview(user),
    listSelectableCategories(user, "INCOME"),
    listSelectableCategories(user, "EXPENSE"),
  ]);
  const today = todayInTimeZone(user.timezone);
  return {
    today,
    minDate: MIN_OCCURRED_ON as IsoDate,
    maxDate: addDays(today, MAX_DAYS_AHEAD),
    accounts: overview.active.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    categories: {
      INCOME: income.map((c) => ({ id: c.id, name: c.name })),
      EXPENSE: expense.map((c) => ({ id: c.id, name: c.name })),
    },
  };
}
