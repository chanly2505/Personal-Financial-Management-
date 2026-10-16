import { z } from "zod";

import { isValidTimeZone } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/money";

/** "KHR per 1 USD": positive decimal, up to 4 decimal places, at most 100,000. */
const RATE_PATTERN = /^\d{1,6}(\.\d{1,4})?$/;

export const profileSchema = z.object({
  /** Empty string clears the name. */
  name: z.string().trim().max(60, "Use at most 60 characters."),
  baseCurrency: z.enum(CURRENCY_CODES, { error: "Choose a currency." }),
  timezone: z
    .string()
    .min(1, "Choose a timezone.")
    .max(64)
    .refine(isValidTimeZone, "Choose a valid timezone."),
  exchangeRateKhrPerUsd: z
    .string()
    .trim()
    .regex(RATE_PATTERN, "Enter a number like 4100 or 4100.50.")
    .refine((v) => Number(v) > 0 && Number(v) <= 100_000, "Enter a rate between 0 and 100,000."),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileValues = z.output<typeof profileSchema>;
