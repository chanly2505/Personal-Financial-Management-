import { describe, expect, it } from "vitest";
import {
  MAX_AMOUNT_MINOR,
  convertMinor,
  formatMoney,
  minorToDecimalString,
  parseMoney,
  sumMinor,
} from "@/lib/money";

describe("parseMoney", () => {
  it.each([
    ["12.34", "USD", 1234n],
    ["12.3", "USD", 1230n],
    ["12", "USD", 1200n],
    ["1,234,567.89", "USD", 123456789n],
    ["  0.01 ", "USD", 1n],
    ["4100", "KHR", 4100n],
    ["1,000,000", "KHR", 1000000n],
  ] as const)("parses %s %s", (input, currency, expected) => {
    expect(parseMoney(input, currency)).toEqual({ ok: true, minor: expected });
  });

  it("does not suffer floating-point error", () => {
    // 0.1 + 0.2 style inputs must stay exact.
    expect(parseMoney("0.29", "USD")).toEqual({ ok: true, minor: 29n });
    expect(parseMoney("1.005", "USD").ok).toBe(false);
  });

  it.each([
    ["", "USD"],
    ["abc", "USD"],
    ["1e5", "USD"],
    ["12.345", "USD"],
    ["12.5", "KHR"],
    ["1,23.00", "USD"],
    ["1,2345", "USD"],
    ["12,5", "KHR"],
    ["1.234", "KHR"],
    ["1.234,567", "USD"],
    ["$12", "USD"],
    ["Infinity", "USD"],
    ["NaN", "USD"],
    ["0x10", "USD"],
  ] as const)("rejects %j for %s", (input, currency) => {
    expect(parseMoney(input, currency).ok).toBe(false);
  });

  it("rejects zero and negatives unless allowed", () => {
    expect(parseMoney("0", "USD").ok).toBe(false);
    expect(parseMoney("-5", "USD").ok).toBe(false);
    expect(parseMoney("0", "USD", { allowZero: true })).toEqual({ ok: true, minor: 0n });
    expect(parseMoney("-5.25", "USD", { allowNegative: true })).toEqual({ ok: true, minor: -525n });
  });

  it("enforces the maximum amount", () => {
    expect(parseMoney(MAX_AMOUNT_MINOR.toString(), "KHR").ok).toBe(true);
    expect(parseMoney((MAX_AMOUNT_MINOR + 1n).toString(), "KHR").ok).toBe(false);
  });

  it("gives a currency-specific message for too many decimals", () => {
    expect(parseMoney("1.5", "KHR")).toEqual({
      ok: false,
      error: "KHR amounts must be whole numbers.",
    });
  });
});

describe("minorToDecimalString", () => {
  it.each([
    [0n, "USD", "0.00"],
    [5n, "USD", "0.05"],
    [123456n, "USD", "1234.56"],
    [-525n, "USD", "-5.25"],
    [4100n, "KHR", "4100"],
    [-4100n, "KHR", "-4100"],
  ] as const)("%s %s -> %s", (minor, currency, expected) => {
    expect(minorToDecimalString(minor, currency)).toBe(expected);
  });

  it("round-trips through parseMoney", () => {
    for (const minor of [1n, 99n, 100n, 123456789n, MAX_AMOUNT_MINOR]) {
      expect(parseMoney(minorToDecimalString(minor, "USD"), "USD")).toEqual({ ok: true, minor });
    }
  });
});

describe("formatMoney", () => {
  it("formats USD with two decimals and grouping", () => {
    expect(formatMoney(123456n, "USD")).toBe("$1,234.56");
    expect(formatMoney(-500n, "USD")).toBe("-$5.00");
  });

  it("formats KHR without decimals", () => {
    expect(formatMoney(410000n, "KHR")).toBe("៛410,000");
  });

  it("formats values beyond float precision exactly", () => {
    expect(formatMoney(MAX_AMOUNT_MINOR, "USD")).toBe("$9,999,999,999,999.99");
  });

  it("can force a sign", () => {
    expect(formatMoney(1000n, "USD", { signDisplay: "always" })).toBe("+$10.00");
  });
});

describe("sumMinor", () => {
  it("sums exactly", () => {
    expect(sumMinor([10n, 20n, -5n])).toBe(25n);
    expect(sumMinor([])).toBe(0n);
  });
});

describe("convertMinor", () => {
  it("returns the same amount for the same currency", () => {
    expect(convertMinor(1234n, "USD", "USD", "4100")).toBe(1234n);
  });

  it("converts USD to KHR", () => {
    // $12.34 * 4100 = 50,594 riel
    expect(convertMinor(1234n, "USD", "KHR", "4100")).toBe(50594n);
    // $0.01 * 4100.5 = 41.005 -> 41
    expect(convertMinor(1n, "USD", "KHR", "4100.5")).toBe(41n);
  });

  it("converts KHR to USD with half-away-from-zero rounding", () => {
    // 4,100 riel = $1.00
    expect(convertMinor(4100n, "KHR", "USD", "4100")).toBe(100n);
    // 20.5 riel = 0.5 cents -> rounds to 1 cent
    expect(convertMinor(205n, "KHR", "USD", "41000")).toBe(1n);
    expect(convertMinor(-205n, "KHR", "USD", "41000")).toBe(-1n);
  });

  it("rejects invalid rates", () => {
    expect(() => convertMinor(1n, "USD", "KHR", "0")).toThrow(RangeError);
    expect(() => convertMinor(1n, "USD", "KHR", "-1")).toThrow(RangeError);
    expect(() => convertMinor(1n, "USD", "KHR", "abc")).toThrow(RangeError);
  });
});

describe("comma-decimal input (number format preferences)", () => {
  it.each([
    ["12,34", "USD", 1234n],
    ["12,5", "USD", 1250n],
    ["1.234,56", "USD", 123456n],
    ["1 234,56", "USD", 123456n],
    ["1\u202F234,56", "USD", 123456n],
    ["4 100 000", "KHR", 4100000n],
    // A comma before exactly three digits stays a thousands separator.
    ["1,234", "USD", 123400n],
    ["1,234", "KHR", 1234n],
  ] as const)("parses %j as %s", (input, currency, minor) => {
    expect(parseMoney(input, currency)).toEqual({ ok: true, minor });
  });
});
