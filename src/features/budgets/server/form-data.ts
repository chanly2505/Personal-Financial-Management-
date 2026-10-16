import "server-only";

import { getAccountsOverview } from "@/features/accounts/server/service";
import { listSelectableCategories } from "@/features/categories/server/service";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";

import { MIN_MONTH } from "../constants";
import { shiftMonth } from "../month";
import { currentMonth } from "./service";

/** What the budget form needs: active expense categories, sensible currencies, month bounds. */
export async function getBudgetFormData(
  user: Pick<CurrentUser, "id" | "timezone" | "baseCurrency">,
) {
  const [categories, overview] = await Promise.all([
    listSelectableCategories(user, "EXPENSE"),
    getAccountsOverview(user),
  ]);
  const used = new Set<CurrencyCode>(overview.active.map((a) => a.currency));
  // Currencies of the user's accounts first; the other remains available.
  const currencies = [...CURRENCY_CODES].sort((a, b) => Number(used.has(b)) - Number(used.has(a)));
  const current = currentMonth(user);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    currencies,
    defaultCurrency: used.has(user.baseCurrency) ? user.baseCurrency : (currencies[0] ?? "USD"),
    currentMonth: current,
    minMonth: MIN_MONTH,
    maxMonth: shiftMonth(current, 12),
  };
}
