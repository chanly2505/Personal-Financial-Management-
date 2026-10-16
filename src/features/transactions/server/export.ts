import "server-only";

import { type CsvCell, UTF8_BOM, csvRow } from "@/lib/csv";
import { todayInTimeZone } from "@/lib/dates";
import { minorToDecimalString } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";
import { ValidationError } from "@/server/errors";
import { describeError, logger } from "@/server/logger";

import { EXPORT_BATCH_SIZE, EXPORT_MAX_ROWS, KIND_LABELS } from "../constants";
import type { LedgerFilters } from "../schemas";
import * as repo from "./repository";
import { toLedgerQuery } from "./service";

/**
 * CSV export of the ledger (docs/REPORTS.md §Export).
 *
 * - Scope: only the signed-in user's records (every query is scoped by the
 *   session user's id; ids in the URL can only narrow, never widen, the set).
 * - Filters: exactly the /transactions filters (search, type, account,
 *   category, currency, dates, amounts). Rows are in date order — oldest first
 *   for "Oldest first", otherwise newest first (amount sorting is not applied).
 * - Format: UTF-8 with BOM, comma-separated, CRLF, RFC 4180 quoting; dates
 *   YYYY-MM-DD (the calendar date as entered); amounts are positive plain
 *   decimals with "." and the currency's digits (USD 2, KHR 0), no grouping or
 *   symbols — the Type column gives the direction.
 * - Content: record fields only. No user ids, emails, auth data or secrets.
 */

export const EXPORT_COLUMNS = [
  "Date",
  "Type",
  "Amount",
  "Currency",
  "Account",
  "To account",
  "Category",
  "Payee",
  "Note",
  "Reversal",
  "Record ID",
] as const;

function toCells(row: repo.ExportRow): CsvCell[] {
  const reversal = row.reversesId
    ? `Reverses ${row.reversesId}`
    : row.reversedById
      ? `Reversed by ${row.reversedById}`
      : "";
  return [
    { raw: row.occurredOn },
    { raw: KIND_LABELS[row.kind] },
    { raw: minorToDecimalString(row.amountMinor, row.currency) },
    { raw: row.currency },
    { text: row.accountName },
    { text: row.toAccountName },
    { text: row.categoryName },
    { text: row.payee },
    { text: row.note },
    { raw: reversal },
    { raw: row.id },
  ];
}

export interface PreparedExport {
  filename: string;
  rowCount: number;
  stream: ReadableStream<Uint8Array>;
}

/**
 * Count first (refusing over-limit requests with a clear message), then stream
 * the rows in keyset-paginated batches. The stream never writes more than
 * EXPORT_MAX_ROWS data rows.
 */
export async function prepareLedgerExport(
  user: Pick<CurrentUser, "id" | "timezone">,
  filters: LedgerFilters,
  limits: { maxRows: number; batchSize: number } = {
    maxRows: EXPORT_MAX_ROWS,
    batchSize: EXPORT_BATCH_SIZE,
  },
): Promise<PreparedExport> {
  const { sort, ...query } = toLedgerQuery(filters);
  const totals = await repo.summarizeLedger(user.id, query);
  const rowCount = totals.reduce((sum, t) => sum + t.count, 0);
  if (rowCount > limits.maxRows) {
    throw new ValidationError(
      `This export would have ${rowCount.toLocaleString("en-US")} rows; the limit is ${limits.maxRows.toLocaleString("en-US")}. Choose a shorter date range or add filters, then export again.`,
    );
  }
  const direction = sort === "date_asc" ? "asc" : "desc";
  const encoder = new TextEncoder();
  let cursor: repo.ExportCursor | null = null;
  let written = 0;
  let started = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(
            encoder.encode(UTF8_BOM + csvRow(EXPORT_COLUMNS.map((c) => ({ raw: c })))),
          );
          return;
        }
        const take = Math.min(limits.batchSize, limits.maxRows - written);
        const rows =
          take > 0 ? await repo.exportLedgerBatch(user.id, query, direction, cursor, take) : [];
        if (rows.length === 0) {
          logger.info("export.finished", { userId: user.id, rows: written });
          controller.close();
          return;
        }
        const last = rows[rows.length - 1]!;
        cursor = { occurredOn: last.occurredOn, createdAt: last.createdAt, id: last.id };
        written += rows.length;
        controller.enqueue(encoder.encode(rows.map((r) => csvRow(toCells(r))).join("")));
      } catch (error) {
        logger.error("export.failed", { userId: user.id, rows: written, ...describeError(error) });
        controller.error(error);
      }
    },
  });

  return {
    filename: `transactions-${todayInTimeZone(user.timezone)}.csv`,
    rowCount,
    stream,
  };
}
