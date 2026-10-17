/**
 * Display preferences (docs/PRD.md §6.13). They change how amounts and dates
 * are *shown* — never the stored values, which stay exact minor units and
 * calendar dates. Values match the database enums.
 */

export const DATE_FORMATS = ["D_MMM_Y", "MMM_D_Y", "DD_MM_Y", "ISO"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const NUMBER_FORMATS = ["COMMA_DOT", "DOT_COMMA", "SPACE_COMMA"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export const CURRENCY_DISPLAYS = ["SYMBOL", "CODE"] as const;
export type CurrencyDisplay = (typeof CURRENCY_DISPLAYS)[number];

export interface FormatPrefs {
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  currencyDisplay: CurrencyDisplay;
}

export const DEFAULT_FORMAT_PREFS: FormatPrefs = Object.freeze({
  dateFormat: "D_MMM_Y",
  numberFormat: "COMMA_DOT",
  currencyDisplay: "SYMBOL",
});

/** Grouping and decimal characters per number format. */
export const SEPARATORS: Record<NumberFormat, { group: string; decimal: string }> = {
  COMMA_DOT: { group: ",", decimal: "." },
  DOT_COMMA: { group: ".", decimal: "," },
  // U+202F narrow no-break space: groups never wrap onto two lines.
  SPACE_COMMA: { group: " ", decimal: "," },
};

export function isFormatPrefs(value: unknown): value is FormatPrefs {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    DATE_FORMATS.includes(v.dateFormat as DateFormat) &&
    NUMBER_FORMATS.includes(v.numberFormat as NumberFormat) &&
    CURRENCY_DISPLAYS.includes(v.currencyDisplay as CurrencyDisplay)
  );
}
