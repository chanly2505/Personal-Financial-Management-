import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/money";

import { DEFAULT_PERIOD, PERIOD_PRESETS } from "./constants";

/** Dashboard URL params. Invalid values fall back to defaults instead of failing the page. */
const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (first(v) === "" ? undefined : first(v)), schema.optional().catch(undefined));

export const dashboardFiltersSchema = z.object({
  period: z.preprocess(first, z.enum(PERIOD_PRESETS).catch(DEFAULT_PERIOD)),
  from: optional(z.string().refine(isIsoDate)),
  to: optional(z.string().refine(isIsoDate)),
  /** Which currency the charts show when the user has more than one. */
  currency: optional(z.enum(CURRENCY_CODES)),
});
export type DashboardFilters = z.output<typeof dashboardFiltersSchema>;
