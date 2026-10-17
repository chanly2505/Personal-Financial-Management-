import { prepareDataExport } from "@/features/settings/server/data-export";
import { withUser } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/export — all of the signed-in user's data as JSON (Settings →
 * Your data). No parameters: the user always comes from the verified session.
 * 401 without a session. Never cached.
 */
export const GET = withUser(async (_request, _context, user) => {
  const { stream, filename } = await prepareDataExport(user);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
