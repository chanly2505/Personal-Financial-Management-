import { describe, expect, it } from "vitest";

import { UTF8_BOM, csvCell, csvRow, neutralizeFormula, quoteField } from "@/lib/csv";

describe("RFC 4180 quoting", () => {
  it.each([
    ["plain", "plain"],
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["line1\nline2", '"line1\nline2"'],
    ["line1\r\nline2", '"line1\r\nline2"'],
    ["", ""],
    ["ភេសជ្ជៈ កាហ្វេ", "ភេសជ្ជៈ កាហ្វេ"],
  ])("%j → %j", (input, expected) => {
    expect(quoteField(input)).toBe(expected);
  });

  it("joins cells with commas and ends rows with CRLF", () => {
    expect(csvRow([{ raw: "2026-03-01" }, { text: "Coffee, large" }, { text: null }])).toBe(
      '2026-03-01,"Coffee, large",\r\n',
    );
  });
});

describe("formula injection", () => {
  it.each([
    "=1+1",
    "+1",
    "-2",
    "@SUM(A1)",
    "\tcmd",
    "\rcmd",
    '  =HYPERLINK("x")',
    "=cmd|' /C calc'!A0",
  ])("neutralises %j", (input) => {
    expect(neutralizeFormula(input)).toBe(`'${input}`);
    expect(csvCell({ text: input }).replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it.each(["Coffee", "100", "a=b", "email@example.test", " leading space", "", "'already"])(
    "leaves %j alone",
    (input) => {
      expect(neutralizeFormula(input)).toBe(input);
    },
  );

  it("never neutralises values the app generates (negative numbers stay numbers)", () => {
    expect(csvCell({ raw: "-12.50" })).toBe("-12.50");
  });

  it("neutralises and then quotes a dangerous value containing a comma", () => {
    expect(csvCell({ text: '=HYPERLINK("http://x",1)' })).toBe('"\'=HYPERLINK(""http://x"",1)"');
  });
});

it("exposes the UTF-8 byte order mark", () => {
  expect(UTF8_BOM).toBe("﻿");
});
