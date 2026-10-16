import "server-only";

import { getAccountsOverview } from "@/features/accounts/server/service";
import type { CurrentUser } from "@/server/auth/session";

/** Active accounts (for "Kept in") and a default currency for the goal form. */
export async function getGoalFormData(user: Pick<CurrentUser, "id" | "timezone" | "baseCurrency">) {
  const overview = await getAccountsOverview(user);
  return {
    accounts: overview.active.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    defaultCurrency: user.baseCurrency,
  };
}
