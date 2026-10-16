import { isDatabaseReachable } from "@/server/health";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for hosting platforms and local setup checks.
 * Reveals only up/down — no versions, hostnames or error details.
 */
export async function GET() {
  const database = await isDatabaseReachable();
  return Response.json(
    { status: database ? "ok" : "error", database: database ? "ok" : "unreachable" },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
