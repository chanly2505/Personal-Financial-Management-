import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

/**
 * Prisma client. Only repositories (src/features/<module>/server/repository.ts)
 * should import this. One client per process, kept on globalThis so
 * development hot reloads do not open a new connection pool each time.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = (globalForPrisma.prisma ??= createPrismaClient());

export type DbClient = PrismaClient;
