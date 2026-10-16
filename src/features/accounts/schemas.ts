import { z } from "zod";

import { CURRENCY_CODES } from "@/lib/money";

import { ACCOUNT_NAME_MAX, ACCOUNT_TYPES } from "./constants";

/**
 * Account inputs. The opening balance travels as the text the user typed and
 * is parsed into minor units by the service with the account's currency
 * (src/lib/money.ts) — never via floating point.
 */

const nameSchema = z
  .string({ error: "Enter a name." })
  .trim()
  .min(1, "Enter a name.")
  .max(ACCOUNT_NAME_MAX, `Use at most ${ACCOUNT_NAME_MAX} characters.`);

const openingBalanceSchema = z
  .string()
  .trim()
  .max(32, "That amount is too long.")
  .transform((value) => (value === "" ? "0" : value));

export const idSchema = z.uuid({ error: "That item could not be found." });

export const createAccountSchema = z.object({
  name: nameSchema,
  type: z.enum(ACCOUNT_TYPES, { error: "Choose an account type." }),
  currency: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
  openingBalance: openingBalanceSchema,
});
export type CreateAccountInput = z.input<typeof createAccountSchema>;

/** Currency is deliberately absent: it can never change after creation. */
export const updateAccountSchema = z.object({
  id: idSchema,
  name: nameSchema,
  type: z.enum(ACCOUNT_TYPES, { error: "Choose an account type." }),
  openingBalance: openingBalanceSchema,
});
export type UpdateAccountInput = z.input<typeof updateAccountSchema>;

export const accountIdSchema = z.object({ id: idSchema });
export type AccountIdInput = z.input<typeof accountIdSchema>;
