/**
 * CSV encoding (RFC 4180) with spreadsheet formula-injection protection.
 *
 * - Fields containing a comma, double quote, CR or LF are wrapped in double
 *   quotes; embedded quotes are doubled.
 * - Rows end with CRLF.
 * - Untrusted text (names, payees, notes) that a spreadsheet would treat as a
 *   formula — starting with = + - @, a tab or a carriage return, also after
 *   leading spaces — is prefixed with a single quote ('), following the OWASP
 *   "CSV Injection" guidance. The cell then shows as text and never runs.
 *   Values the app generates itself (dates, amounts, ids) are written as-is,
 *   so negative numbers stay numbers.
 */

const FORMULA_START = /^[\s]*[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** Neutralise text a spreadsheet would evaluate as a formula. */
export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Quote a field when RFC 4180 requires it. */
export function quoteField(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type CsvCell =
  /** Untrusted text: formula-neutralised, then quoted. null → empty. */
  | { text: string | null }
  /** A value the app generated (date, decimal amount, id, code): quoted only. */
  | { raw: string };

export function csvCell(cell: CsvCell): string {
  if ("raw" in cell) return quoteField(cell.raw);
  return cell.text === null ? "" : quoteField(neutralizeFormula(cell.text));
}

/** One CSV line, including the trailing CRLF. */
export function csvRow(cells: CsvCell[]): string {
  return `${cells.map(csvCell).join(",")}\r\n`;
}

/** UTF-8 byte order mark: lets Excel detect UTF-8 (e.g. Khmer text) instead of guessing. */
export const UTF8_BOM = "﻿";
