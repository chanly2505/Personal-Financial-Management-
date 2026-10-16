import { z } from "zod";

import { CURRENCY_CODES } from "@/lib/money";

import { MAX_ALERT_THRESHOLD, MIN_ALERT_THRESHOLD, MONTH_PATTERN } from "./constants";

/** Budget inputs. The limit travels as typed text and is parsed with the budget's currency. */

const monthSchema = z.string({ error: "Choose a month." }).regex(MONTH_PATTERN, "Choose a month.");

const amountSchema = z
  .string({ error: "Enter a limit." })
  .trim()
  .min(1, "Enter a limit.")
  .max(32, "That amount is too long.");

const thresholdSchema = z.coerce
  .number({ error: "Enter a whole percentage." })
  .int("Enter a whole percentage.")
  .min(MIN_ALERT_THRESHOLD, `Use ${MIN_ALERT_THRESHOLD}–${MAX_ALERT_THRESHOLD} %.`)
  .max(MAX_ALERT_THRESHOLD, `Use ${MIN_ALERT_THRESHOLD}–${MAX_ALERT_THRESHOLD} %.`);

export const createBudgetSchema = z.object({
  categoryId: z.uuid({ error: "Choose a category." }),
  currency: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
  month: monthSchema,
  amount: amountSchema,
  alertThresholdPercent: thresholdSchema,
});
export type CreateBudgetInput = z.input<typeof createBudgetSchema>;

/** Category, currency and month identify a budget and cannot change; create another instead. */
export const updateBudgetSchema = z.object({
  id: z.uuid({ error: "We couldn't find that budget." }),
  amount: amountSchema,
  alertThresholdPercent: thresholdSchema,
  expectedUpdatedAt: z.iso.datetime({ error: "Please reload the page and try again." }),
});
export type UpdateBudgetInput = z.input<typeof updateBudgetSchema>;

export const budgetIdSchema = z.object({ id: z.uuid({ error: "We couldn't find that budget." }) });
export type BudgetIdInput = z.input<typeof budgetIdSchema>;

export const copyBudgetsSchema = z.object({ month: monthSchema });
export type CopyBudgetsInput = z.input<typeof copyBudgetsSchema>;

export const markAlertsReadSchema = z.object({
  /** Omit to mark every alert as read. */
  ids: z.array(z.uuid()).max(100).optional(),
});
export type MarkAlertsReadInput = z.input<typeof markAlertsReadSchema>;

/** The /budgets?month= URL param; invalid values fall back to the current month. */
export const budgetMonthParamSchema = z.object({
  month: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    monthSchema.optional().catch(undefined),
  ),
});
