/**
 * Optional in-process scheduler (RECURRING_SCHEDULER=in-process): runs
 * recurring rules shortly after the server starts and then every hour, for a
 * single self-hosted server. Hosted deployments use the cron endpoint instead.
 * Runs are idempotent, so overlapping with other schedulers is harmless.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RECURRING_SCHEDULER !== "in-process") return;
  const { startInProcessScheduler } = await import("@/server/recurring-scheduler");
  startInProcessScheduler();
}
