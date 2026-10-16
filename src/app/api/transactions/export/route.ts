import { prepareLedgerExport } from "@/features/transactions/server/export";
import { ledgerFiltersSchema } from "@/features/transactions/schemas";
import { withUser } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/transactions/export?<the /transactions filters>
 *
 * Streams the signed-in user's matching records as CSV (docs/REPORTS.md §Export).
 * The user always comes from the verified session — there is no user parameter,
 * and account/category ids in the query only narrow that user's own records.
 * 401 without a session; 422 when the filters match more than the row limit.
 */
export const GET = withUser(async (request, _context, user) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = ledgerFiltersSchema.parse(params);
  const { filename, rowCount, stream } = await prepareLedgerExport(user, filters);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Export-Rows": String(rowCount),
    },
  });
});
