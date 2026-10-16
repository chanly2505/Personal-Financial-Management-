import "server-only";

import { prisma } from "./db";
import { describeError, logger } from "./logger";

/** True when the database answers a trivial query within the pool's timeout. */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error("health.database_unreachable", describeError(error));
    return false;
  }
}
