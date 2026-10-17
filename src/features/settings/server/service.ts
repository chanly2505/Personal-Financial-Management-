import "server-only";

import { resyncAllAlerts } from "@/features/budgets/server/service";
import type { BudgetAlertMode } from "@/features/budgets/constants";
import type { FormatPrefs } from "@/lib/format/preferences";
import type { CurrencyCode } from "@/lib/money";
import { NotFoundError } from "@/server/errors";

import type { NotificationsValues, PreferencesValues, ProfileValues } from "../schemas";
import * as repo from "./repository";

/**
 * User settings (docs/PRD.md §6.13). Preferences only change presentation and
 * the meaning of "today": no stored amount or date is ever converted or
 * rewritten when they change.
 */

export interface Settings extends FormatPrefs {
  email: string;
  name: string | null;
  baseCurrency: CurrencyCode;
  timezone: string;
  budgetAlertMode: BudgetAlertMode;
  defaultAlertThreshold: number;
  passwordChangedAt: Date;
  createdAt: Date;
}

export async function getSettings(userId: string): Promise<Settings> {
  const settings = await repo.findSettings(userId);
  if (!settings) throw new NotFoundError();
  return settings;
}

export async function updateProfile(userId: string, values: ProfileValues): Promise<void> {
  await repo.updateProfile(userId, values);
}

export async function updatePreferences(userId: string, values: PreferencesValues): Promise<void> {
  await repo.updatePreferences(userId, values);
}

/** Saves the preference, then brings the bell in line with it straight away. */
export async function updateNotifications(
  userId: string,
  values: NotificationsValues,
): Promise<void> {
  await repo.updateNotifications(userId, values);
  await resyncAllAlerts(userId);
}

export type RecordCounts = Awaited<ReturnType<typeof repo.countRecords>>;

export function getRecordCounts(userId: string): Promise<RecordCounts> {
  return repo.countRecords(userId);
}
