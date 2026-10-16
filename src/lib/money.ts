/**
 * Decimal-safe money handling.
 *
 * Every monetary value in the system is an integer count of the currency's
 * minor unit, held as a `bigint` in TypeScript and BIGINT in PostgreSQL.
 * JavaScript `number` is never used for authoritative arithmetic: parsing goes
 * string -> bigint, formatting goes bigint -> decimal string -> Intl.
 *
 * Minor-unit exponents are an application decision (see docs/DATABASE.md):
 *   USD: 2  (1 USD = 100 cents)
 *   KHR: 0  (riel has no subunit in everyday use)
 */

export const CURRENCY_CODES = ["USD", "KHR"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

interface CurrencyMeta {
  code: CurrencyCode;
  exponent: number;
  /** Human label for selects and settings. */
  label: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  USD: { code: "USD", exponent: 2, label: "US Dollar (USD)" },
  KHR: { code: "KHR", exponent: 0, label: "Cambodian Riel (KHR)" },
};

/**
 * Largest absolute amount accepted for a single value, in minor units.
 * Comfortably inside both PostgreSQL BIGINT and Number.MAX_SAFE_INTEGER so
 * values can never lose precision if they cross a JSON boundary as numbers.
 */
export const MAX_AMOUNT_MINOR = 999_999_999_999_999n;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCY_CODES as readonly string[]).includes(value);
}

export type ParseMoneyResult = { ok: true; minor: bigint } | { ok: false; error: string };

export interface ParseMoneyOptions {
  /** Accept a leading "-" (e.g. opening balances, savings withdrawals). */
  allowNegative?: boolean;
  /** Accept 0. Off by default because most amounts must be positive. */
  allowZero?: boolean;
}

// Digits with optional thousands separators in groups of three, or plain digits,
// followed by an optional fractional part.
const AMOUNT_PATTERN = /^(?<int>\d{1,3}(?:,\d{3})+|\d+)(?:\.(?<frac>\d+))?$/;

/**
 * Parse user input such as "1,234.50" into minor units for `currency`.
 * Rejects scientific notation, more decimals than the currency allows,
 * empty input, and anything outside ±MAX_AMOUNT_MINOR.
 */
export function parseMoney(
  input: string,
  currency: CurrencyCode,
  options: ParseMoneyOptions = {},
): ParseMoneyResult {
  const { exponent } = CURRENCIES[currency];
  let text = input.trim();
  if (text === "") return { ok: false, error: "Enter an amount." };

  let negative = false;
  if (text.startsWith("-")) {
    if (!options.allowNegative) return { ok: false, error: "Amount cannot be negative." };
    negative = true;
    text = text.slice(1).trim();
  }

  const match = AMOUNT_PATTERN.exec(text);
  if (!match?.groups) return { ok: false, error: "Enter a valid number, like 1,250.50." };

  const intPart = (match.groups.int ?? "").replaceAll(",", "");
  const fracPart = match.groups.frac ?? "";
  if (fracPart.length > exponent) {
    return {
      ok: false,
      error:
        exponent === 0
          ? `${currency} amounts must be whole numbers.`
          : `${currency} amounts can have at most ${exponent} decimal places.`,
    };
  }

  const minorAbs = BigInt(intPart + fracPart.padEnd(exponent, "0"));
  if (minorAbs > MAX_AMOUNT_MINOR) return { ok: false, error: "Amount is too large." };
  if (minorAbs === 0n && !options.allowZero) {
    return { ok: false, error: "Amount must be greater than zero." };
  }

  return { ok: true, minor: negative ? -minorAbs : minorAbs };
}

/**
 * Plain decimal string for minor units, e.g. (123456n, "USD") -> "1234.56".
 * Suitable for form default values and CSV export. No grouping, no symbol.
 */
export function minorToDecimalString(minor: bigint, currency: CurrencyCode): string {
  const { exponent } = CURRENCIES[currency];
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString();
  if (exponent === 0) return (negative ? "-" : "") + digits;
  const padded = digits.padStart(exponent + 1, "0");
  const int = padded.slice(0, -exponent);
  const frac = padded.slice(-exponent);
  return `${negative ? "-" : ""}${int}.${frac}`;
}

export interface FormatMoneyOptions {
  locale?: string;
  /** "always" shows "+" for positive amounts (useful for income rows). */
  signDisplay?: "auto" | "always" | "exceptZero" | "never";
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: CurrencyCode, locale: string, signDisplay: string) {
  const key = `${currency}|${locale}|${signDisplay}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    const { exponent } = CURRENCIES[currency];
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
      signDisplay: signDisplay as Intl.NumberFormatOptions["signDisplay"],
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Display string, e.g. (123456n, "USD") -> "$1,234.56", (410000n, "KHR") -> "៛410,000".
 * Intl receives an exact decimal string, never a float.
 */
export function formatMoney(
  minor: bigint,
  currency: CurrencyCode,
  { locale = "en-US", signDisplay = "auto" }: FormatMoneyOptions = {},
): string {
  const decimal = minorToDecimalString(minor, currency) as Intl.StringNumericLiteral;
  return getFormatter(currency, locale, signDisplay).format(decimal);
}

/** Exact sum of minor-unit amounts. */
export function sumMinor(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

/** Integer division rounding half away from zero. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

const RATE_PATTERN = /^(?<int>\d+)(?:\.(?<frac>\d{1,8}))?$/;

/** Parse a positive decimal rate string (e.g. "4100.0000") into a scaled bigint. */
export function parseRate(rate: string): { scaled: bigint; scale: bigint } {
  const match = RATE_PATTERN.exec(rate.trim());
  if (!match?.groups) throw new RangeError(`Invalid exchange rate: ${rate}`);
  const frac = match.groups.frac ?? "";
  const scaled = BigInt((match.groups.int ?? "") + frac);
  if (scaled === 0n) throw new RangeError("Exchange rate must be greater than zero");
  return { scaled, scale: 10n ** BigInt(frac.length) };
}

/**
 * Convert between USD and KHR using a user-maintained "KHR per 1 USD" rate.
 * Used only for approximate, clearly-labelled cross-currency totals; stored
 * records are never converted.
 */
export function convertMinor(
  amountMinor: bigint,
  from: CurrencyCode,
  to: CurrencyCode,
  khrPerUsd: string,
): bigint {
  if (from === to) return amountMinor;
  const { scaled, scale } = parseRate(khrPerUsd);
  const usdFactor = 10n ** BigInt(CURRENCIES.USD.exponent);
  const khrFactor = 10n ** BigInt(CURRENCIES.KHR.exponent);
  if (from === "USD") {
    // usdMinor / usdFactor * rate * khrFactor
    return divideRounded(amountMinor * scaled * khrFactor, usdFactor * scale);
  }
  // khrMinor / khrFactor / rate * usdFactor
  return divideRounded(amountMinor * usdFactor * scale, khrFactor * scaled);
}
