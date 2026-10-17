import { z } from "zod";

import {
  BUDGET_ALERT_MODES,
  MAX_ALERT_THRESHOLD,
  MIN_ALERT_THRESHOLD,
} from "@/features/budgets/constants";
import { isValidTimeZone, normalizeTimeZone } from "@/lib/dates";
import { CURRENCY_DISPLAYS, DATE_FORMATS, NUMBER_FORMATS } from "@/lib/format/preferences";
import { CURRENCY_CODES } from "@/lib/money";

/** Settings inputs. Each card on the Settings page saves one of these on its own. */

export const profileSchema = z.object({
  /** Empty string clears the name. */
  name: z.string().trim().max(60, "Use at most 60 characters."),
});
export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileValues = z.output<typeof profileSchema>;

/**
 * Region and display. These change how things look and what "today" means —
 * never the stored amounts or dates (no conversion, docs/PRD.md §6.13).
 */
export const preferencesSchema = z.object({
  baseCurrency: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
  // Old aliases are stored by their current name; offsets and unknown names are refused (QA-01).
  timezone: z
    .string()
    .min(1, "Choose a timezone.")
    .max(64)
    .refine(isValidTimeZone, "Choose a valid timezone.")
    .transform((tz) => normalizeTimeZone(tz) ?? tz),
  dateFormat: z.enum(DATE_FORMATS, { error: "Choose a date format." }),
  numberFormat: z.enum(NUMBER_FORMATS, { error: "Choose a number format." }),
  currencyDisplay: z.enum(CURRENCY_DISPLAYS, { error: "Choose how currencies are shown." }),
});
export type PreferencesInput = z.input<typeof preferencesSchema>;
export type PreferencesValues = z.output<typeof preferencesSchema>;

export const notificationsSchema = z.object({
  budgetAlertMode: z.enum(BUDGET_ALERT_MODES, { error: "Choose which warnings you want." }),
  defaultAlertThreshold: z.coerce
    .number({ error: "Enter a percentage." })
    .int("Use a whole number.")
    .min(MIN_ALERT_THRESHOLD, `Use ${MIN_ALERT_THRESHOLD}–${MAX_ALERT_THRESHOLD} %.`)
    .max(MAX_ALERT_THRESHOLD, `Use ${MIN_ALERT_THRESHOLD}–${MAX_ALERT_THRESHOLD} %.`),
});
export type NotificationsInput = z.input<typeof notificationsSchema>;
export type NotificationsValues = z.output<typeof notificationsSchema>;
