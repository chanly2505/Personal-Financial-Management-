import { z } from "zod";

import { LEDGER_KINDS } from "@/features/transactions/constants";
import { isIsoDate } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/money";

import {
  DEFAULT_REPORT,
  DEFAULT_REPORT_PRESET,
  GRANULARITY_OPTIONS,
  REPORT_PRESETS,
  REPORT_TABS,
} from "./constants";

/**
 * Report URL params — one filter set shared by every report and the CSV export.
 * Invalid values fall back to defaults instead of failing the page.
 */
const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (first(v) === "" ? undefined : first(v)), schema.optional().catch(undefined));

export const reportFiltersSchema = z.object({
  report: z.preprocess(first, z.enum(REPORT_TABS).catch(DEFAULT_REPORT)),
  period: z.preprocess(first, z.enum(REPORT_PRESETS).catch(DEFAULT_REPORT_PRESET)),
  from: optional(z.string().refine(isIsoDate)),
  to: optional(z.string().refine(isIsoDate)),
  granularity: z.preprocess(first, z.enum(GRANULARITY_OPTIONS).catch("auto")),
  accountId: optional(z.uuid()),
  kind: optional(z.enum(LEDGER_KINDS)),
  categoryId: optional(z.uuid()),
  currency: optional(z.enum(CURRENCY_CODES)),
});
export type ReportFilters = z.output<typeof reportFiltersSchema>;
