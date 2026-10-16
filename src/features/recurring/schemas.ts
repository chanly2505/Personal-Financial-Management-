import { z } from "zod";

import { ENTRY_TYPES, NOTE_MAX, PAYEE_MAX } from "@/features/transactions/constants";
import { isIsoDate } from "@/lib/dates";

import { FREQUENCIES, MAX_INTERVAL, MIN_INTERVAL, NAME_MAX } from "./constants";

/** Recurring rule inputs (amount parsed with the account's currency by the service). */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));

const date = (message: string) => z.string({ error: message }).trim().refine(isIsoDate, message);

const ruleFields = {
  name: z
    .string({ error: "Enter a name." })
    .trim()
    .min(1, "Enter a name.")
    .max(NAME_MAX, `Use at most ${NAME_MAX} characters.`),
  type: z.enum(ENTRY_TYPES, { error: "Choose income or expense." }),
  accountId: z.uuid({ error: "Choose an account." }),
  categoryId: z.uuid({ error: "Choose a category." }),
  amount: z
    .string({ error: "Enter an amount." })
    .trim()
    .min(1, "Enter an amount.")
    .max(32, "That amount is too long."),
  frequency: z.enum(FREQUENCIES, { error: "Choose how often." }),
  interval: z.coerce
    .number({ error: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(MIN_INTERVAL, `Use ${MIN_INTERVAL}–${MAX_INTERVAL}.`)
    .max(MAX_INTERVAL, `Use ${MIN_INTERVAL}–${MAX_INTERVAL}.`),
  startOn: date("Choose a start date."),
  endOn: z.preprocess(
    (v) => (v === "" ? undefined : v),
    date("Choose a valid end date.").optional(),
  ),
  payee: optionalText(PAYEE_MAX),
  description: optionalText(NOTE_MAX),
};

export const createRecurringSchema = z.object({
  ...ruleFields,
  /** Explicit catch-up: also post occurrences between the start date and today. */
  catchUp: z.boolean().optional().default(false),
});
export type CreateRecurringInput = z.input<typeof createRecurringSchema>;

export const updateRecurringSchema = z.object({
  ...ruleFields,
  id: z.uuid({ error: "We couldn't find that recurring rule." }),
  expectedUpdatedAt: z.iso.datetime({ error: "Please reload the page and try again." }),
});
export type UpdateRecurringInput = z.input<typeof updateRecurringSchema>;

export const recurringIdSchema = z.object({
  id: z.uuid({ error: "We couldn't find that recurring rule." }),
});
export type RecurringIdInput = z.input<typeof recurringIdSchema>;
