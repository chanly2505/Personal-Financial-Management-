/**
 * Run due recurring rules once and exit — for system cron, launchd or a
 * platform job runner:  npm run recurring:run
 * Safe to run repeatedly or concurrently (docs/OPERATIONS.md).
 */
import "dotenv/config";

import { runDueRules } from "@/features/recurring/server/service";
import { prisma } from "@/server/db";

async function main() {
  const summary = await runDueRules();
  console.log(JSON.stringify({ event: "recurring.cli_finished", ...summary }));
  await prisma.$disconnect();
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch(async (error: unknown) => {
  console.error(
    JSON.stringify({
      event: "recurring.cli_failed",
      errorName: error instanceof Error ? error.name : typeof error,
    }),
  );
  await prisma.$disconnect();
  process.exit(1);
});
