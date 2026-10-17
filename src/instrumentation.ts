/**
 * Optional in-process scheduler (RECURRING_SCHEDULER=in-process): runs
 * recurring rules shortly after the server starts and then every hour, for a
 * single self-hosted server. Hosted deployments use the cron endpoint instead.
 * Runs are idempotent, so overlapping with other schedulers is harmless.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production" && !process.env.TRUSTED_IP_HEADER) {
    // Without it, per-IP sign-in/registration limits are off (QA-12); see docs/DEPLOYMENT.md.
    const { logger } = await import("@/server/logger");
    logger.warn("security.ip_rate_limits_disabled", { hint: "Set TRUSTED_IP_HEADER" });
  }
  if (process.env.RECURRING_SCHEDULER !== "in-process") return;
  const { startInProcessScheduler } = await import("@/server/recurring-scheduler");
  startInProcessScheduler();
}
