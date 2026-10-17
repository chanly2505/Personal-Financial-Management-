import { timingSafeEqual } from "node:crypto";

import { runScheduledJobs } from "@/server/scheduled-jobs";
import { env } from "@/server/env";
import { describeError, logger } from "@/server/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduler entry point for hosted environments (e.g. Vercel Cron, GitHub
 * Actions, any cron that can send an HTTP request). Requires
 * "Authorization: Bearer $CRON_SECRET"; disabled while CRON_SECRET is unset.
 * Safe to call repeatedly or concurrently (docs/OPERATIONS.md).
 */
function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: Request) {
  if (!env.CRON_SECRET) {
    return Response.json({ error: "Scheduler endpoint is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const summary = await runScheduledJobs();
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("recurring.run_failed", describeError(error));
    return Response.json({ error: "Run failed; it is safe to retry." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
