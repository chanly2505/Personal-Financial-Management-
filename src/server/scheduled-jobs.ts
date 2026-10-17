import "server-only";

import { type RunSummary, runDueRules } from "@/features/recurring/server/service";

import { pruneRateLimits } from "./auth/rate-limit";
import { describeError, logger } from "./logger";

/**
 * Everything that runs on the hourly schedule (cron endpoint, in-process
 * scheduler, `npm run recurring:run`): post due recurring transactions, then
 * housekeeping. Housekeeping never affects the recurring result.
 */
export async function runScheduledJobs(options?: { now?: Date }): Promise<RunSummary> {
  const summary = await runDueRules(options);
  try {
    // Expired rate-limit windows would otherwise pile up forever (QA-13).
    const pruned = await pruneRateLimits();
    if (pruned > 0) logger.info("auth.rate_limits_pruned", { count: pruned });
  } catch (error) {
    logger.error("auth.rate_limit_prune_failed", describeError(error));
  }
  return summary;
}
