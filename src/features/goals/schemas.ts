import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/money";

import { CONTRIBUTION_NOTE_MAX, NAME_MAX, NOTE_MAX } from "./constants";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));
const amount = (empty: string) =>
  z.string({ error: empty }).trim().min(1, empty).max(32, "That amount is too long.");

const goalFields = {
  name: z
    .string({ error: "Enter a name." })
    .trim()
    .min(1, "Enter a name.")
    .max(NAME_MAX, `Use at most ${NAME_MAX} characters.`),
  currency: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
  target: amount("Enter a target amount."),
  targetDate: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().refine(isIsoDate, "Choose a valid date.").optional(),
  ),
  accountId: z.preprocess((v) => (v === "" || v === "none" ? undefined : v), z.uuid().optional()),
  note: optionalText(NOTE_MAX),
};

export const createGoalSchema = z.object(goalFields);
export type CreateGoalInput = z.input<typeof createGoalSchema>;

export const updateGoalSchema = z.object({
  ...goalFields,
  id: z.uuid({ error: "We couldn't find that goal." }),
  expectedUpdatedAt: z.iso.datetime({ error: "Please reload the page and try again." }),
});
export type UpdateGoalInput = z.input<typeof updateGoalSchema>;

export const goalIdSchema = z.object({ id: z.uuid({ error: "We couldn't find that goal." }) });
export type GoalIdInput = z.input<typeof goalIdSchema>;

export const addContributionSchema = z.object({
  goalId: z.uuid({ error: "We couldn't find that goal." }),
  kind: z.enum(["DEPOSIT", "WITHDRAWAL"]),
  amount: amount("Enter an amount."),
  occurredOn: z.string({ error: "Choose a date." }).refine(isIsoDate, "Choose a valid date."),
  note: optionalText(CONTRIBUTION_NOTE_MAX),
  clientRequestId: z.uuid({ error: "Please reload the page and try again." }),
});
export type AddContributionInput = z.input<typeof addContributionSchema>;

export const deleteContributionSchema = z.object({
  goalId: z.uuid(),
  contributionId: z.uuid({ error: "We couldn't find that contribution." }),
});
export type DeleteContributionInput = z.input<typeof deleteContributionSchema>;
