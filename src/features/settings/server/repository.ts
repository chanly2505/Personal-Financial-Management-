import "server-only";

import { prisma } from "@/server/db";

import type { NotificationsValues, PreferencesValues, ProfileValues } from "../schemas";

/** Settings data access. Always keyed by the session user's id; explicit field lists only. */

export function findSettings(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      baseCurrency: true,
      timezone: true,
      dateFormat: true,
      numberFormat: true,
      currencyDisplay: true,
      budgetAlertMode: true,
      defaultAlertThreshold: true,
      passwordChangedAt: true,
      createdAt: true,
    },
  });
}

export function updateProfile(userId: string, values: ProfileValues) {
  return prisma.user.update({
    where: { id: userId },
    data: { name: values.name.trim() || null },
    select: { id: true },
  });
}

export function updatePreferences(userId: string, values: PreferencesValues) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      baseCurrency: values.baseCurrency,
      timezone: values.timezone,
      dateFormat: values.dateFormat,
      numberFormat: values.numberFormat,
      currencyDisplay: values.currencyDisplay,
    },
    select: { id: true },
  });
}

export function updateNotifications(userId: string, values: NotificationsValues) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      budgetAlertMode: values.budgetAlertMode,
      defaultAlertThreshold: values.defaultAlertThreshold,
    },
    select: { id: true },
  });
}

/** How many records of each kind the user has (shown before deleting the account). */
export async function countRecords(userId: string) {
  const where = { userId };
  const [accounts, categories, transactions, transfers, budgets, recurringRules, savingsGoals] =
    await Promise.all([
      prisma.financialAccount.count({ where }),
      prisma.category.count({ where }),
      prisma.transaction.count({ where }),
      prisma.transfer.count({ where }),
      prisma.budget.count({ where }),
      prisma.recurringRule.count({ where }),
      prisma.savingsGoal.count({ where }),
    ]);
  return { accounts, categories, transactions, transfers, budgets, recurringRules, savingsGoals };
}
