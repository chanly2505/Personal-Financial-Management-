import "server-only";

import { runDueRules } from "@/features/recurring/server/service";

import { describeError, logger } from "./logger";

const HOUR = 60 * 60 * 1000;
const FIRST_RUN_DELAY = 30 * 1000;

const state = globalThis as unknown as { recurringTimer?: ReturnType<typeof setInterval> };

/** Hourly runs inside this process; a no-op if already started (hot reload). */
export function startInProcessScheduler() {
  if (state.recurringTimer) return;
  let running = false;
  const tick = async () => {
    if (running) return; // never overlap within one process
    running = true;
    try {
      await runDueRules();
    } catch (error) {
      logger.error("recurring.scheduler_tick_failed", describeError(error));
    } finally {
      running = false;
    }
  };
  setTimeout(tick, FIRST_RUN_DELAY);
  state.recurringTimer = setInterval(tick, HOUR);
  logger.info("recurring.scheduler_started", { intervalMinutes: 60 });
}
