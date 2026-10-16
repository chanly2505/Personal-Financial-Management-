import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/money";

import { ENTRY_TYPES, LEDGER_KINDS, NOTE_MAX, PAYEE_MAX, SORT_OPTIONS } from "./constants";

/**
 * Transaction inputs. Amounts travel as the text the user typed and are parsed
 * into minor units by the service with the account's currency (never floats).
 * Dates are calendar dates (YYYY-MM-DD); the allowed range depends on the
 * user's "today" and is checked by the service.
 */

const id = (message = "That item could not be found.") => z.uuid({ error: message });

const amountSchema = z
  .string({ error: "Enter an amount." })
  .trim()
  .min(1, "Enter an amount.")
  .max(32, "That amount is too long.");

const dateSchema = z
  .string({ error: "Choose a date." })
  .trim()
  .refine(isIsoDate, "Choose a valid date.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((value) => (value ? value : undefined));

const entryFields = {
  type: z.enum(ENTRY_TYPES, { error: "Choose income or expense." }),
  accountId: id("Choose an account."),
  categoryId: id("Choose a category."),
  amount: amountSchema,
  occurredOn: dateSchema,
  payee: optionalText(PAYEE_MAX),
  note: optionalText(NOTE_MAX),
};

/** `clientRequestId`: generated once per form; resubmitting it returns the first result. */
export const createEntrySchema = z.object({
  ...entryFields,
  clientRequestId: id("Please reload the page and try again."),
});
export type CreateEntryInput = z.input<typeof createEntrySchema>;

/** `expectedUpdatedAt`: the version the user edited; a newer one means someone else changed it. */
export const updateEntrySchema = z.object({
  ...entryFields,
  id: id(),
  expectedUpdatedAt: z.iso.datetime({ error: "Please reload the page and try again." }),
});
export type UpdateEntryInput = z.input<typeof updateEntrySchema>;

const transferFields = {
  fromAccountId: id("Choose the account the money leaves."),
  toAccountId: id("Choose the account the money goes to."),
  amount: amountSchema,
  occurredOn: dateSchema,
  note: optionalText(NOTE_MAX),
};

const differentAccounts = {
  check: (v: { fromAccountId: string; toAccountId: string }) => v.fromAccountId !== v.toAccountId,
  params: { path: ["toAccountId"], message: "Choose two different accounts." },
};

export const createTransferSchema = z
  .object({ ...transferFields, clientRequestId: id("Please reload the page and try again.") })
  .refine(differentAccounts.check, differentAccounts.params);
export type CreateTransferInput = z.input<typeof createTransferSchema>;

export const updateTransferSchema = z
  .object({
    ...transferFields,
    id: id(),
    expectedUpdatedAt: z.iso.datetime({ error: "Please reload the page and try again." }),
  })
  .refine(differentAccounts.check, differentAccounts.params);
export type UpdateTransferInput = z.input<typeof updateTransferSchema>;

export const recordIdSchema = z.object({ id: id() });
export type RecordIdInput = z.input<typeof recordIdSchema>;

export const reverseTransferSchema = z.object({
  id: id(),
  clientRequestId: id("Please reload the page and try again."),
});
export type ReverseTransferInput = z.input<typeof reverseTransferSchema>;

/**
 * Ledger filters from URL search params. Invalid values are dropped rather
 * than failing the page, so a hand-edited URL still shows something sensible.
 */
const optionalParam = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value === "" ? undefined : value),
    schema.optional().catch(undefined),
  );

export const ledgerFiltersSchema = z.object({
  q: optionalParam(z.string().trim().max(80)),
  kind: optionalParam(z.enum(LEDGER_KINDS)),
  accountId: optionalParam(z.uuid()),
  categoryId: optionalParam(z.uuid()),
  currency: optionalParam(z.enum(CURRENCY_CODES)),
  from: optionalParam(z.string().refine(isIsoDate)),
  to: optionalParam(z.string().refine(isIsoDate)),
  min: optionalParam(
    z
      .string()
      .trim()
      .regex(/^\d{1,15}(\.\d{1,2})?$/),
  ),
  max: optionalParam(
    z
      .string()
      .trim()
      .regex(/^\d{1,15}(\.\d{1,2})?$/),
  ),
  sort: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.enum(SORT_OPTIONS).catch("date_desc"),
  ),
  page: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.coerce.number().int().min(1).max(100_000).catch(1),
  ),
});
export type LedgerFilters = z.output<typeof ledgerFiltersSchema>;
