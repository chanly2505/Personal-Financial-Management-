import { isDatabaseReachable } from "@/server/health";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for uptime monitors, deploy checks and local setup.
 * Reveals only up/down plus the deployed commit (the repository is public, so
 * the commit id discloses nothing; it lets a release check confirm which
 * version is live). No hostnames, timings or error details.
 */
export async function GET() {
  const database = await isDatabaseReachable();
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  return Response.json(
    { status: database ? "ok" : "error", database: database ? "ok" : "unreachable", version },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
