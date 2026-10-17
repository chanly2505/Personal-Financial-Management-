import { formatDate } from "@/lib/format/dates";
import {
  type CurrencyDisplay,
  DEFAULT_FORMAT_PREFS,
  type DateFormat,
  type NumberFormat,
} from "@/lib/format/preferences";
import { formatMoney } from "@/lib/money";

import type { BudgetAlertMode } from "@/features/budgets/constants";
import { t } from "@/i18n";

/** Choices on the Settings page, labelled with a live example of each format. */

const EXAMPLE_DATE = "2026-10-17";
const prefs = (patch: Partial<typeof DEFAULT_FORMAT_PREFS>) => ({
  ...DEFAULT_FORMAT_PREFS,
  ...patch,
});

export const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = (
  ["D_MMM_Y", "MMM_D_Y", "DD_MM_Y", "ISO"] as const
).map((value) => ({ value, label: formatDate(EXAMPLE_DATE, prefs({ dateFormat: value })) }));

export const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string }[] = (
  ["COMMA_DOT", "DOT_COMMA", "SPACE_COMMA"] as const
).map((value) => ({
  value,
  label: formatMoney(123456789n, "USD", { prefs: prefs({ numberFormat: value }) }).replace("$", ""),
}));

export const CURRENCY_DISPLAY_OPTIONS: { value: CurrencyDisplay; label: string }[] = (
  ["SYMBOL", "CODE"] as const
).map((value) => ({ value, label: t(`settings.currencyDisplay.${value}`) }));

export const BUDGET_ALERT_OPTIONS: {
  value: BudgetAlertMode;
  label: string;
  description: string;
}[] = (["ALL", "LIMIT_ONLY", "OFF"] as const).map((value) => ({
  value,
  label: t(`settings.budgetAlerts.${value}.label`),
  description: t(`settings.budgetAlerts.${value}.description`),
}));
