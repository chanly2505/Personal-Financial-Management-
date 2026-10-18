import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

/**
 * Prisma client. Only repositories (src/features/<module>/server/repository.ts)
 * should import this.
 *
 * - Node.js (local, Vercel, tests): one client per process, kept on globalThis
 *   so development hot reloads do not open a new connection pool each time.
 * - Cloudflare Workers: one client per request. Workers cannot reuse a
 *   database connection opened by another request, so the client is keyed by
 *   the request's execution context and disconnected when the response ends.
 */
const onCloudflareWorkers =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const perRequest = new WeakMap<object, PrismaClient>();

function currentClient(): PrismaClient {
  if (onCloudflareWorkers) {
    const { ctx } = getCloudflareContext();
    let client = perRequest.get(ctx);
    if (!client) {
      client = createPrismaClient();
      perRequest.set(ctx, client);
    }
    return client;
  }
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

/**
 * Called by the Workers entry (cloudflare/worker.ts) once a response has been
 * fully sent: closes that request's connections cleanly. Otherwise Workers
 * tears the sockets down at the end of the request, which `pg` reports as
 * an uncaught "Network connection lost".
 */
async function disposeRequestClient(ctx: object): Promise<void> {
  const client = perRequest.get(ctx);
  if (!client) return;
  perRequest.delete(ctx);
  await client.$disconnect().catch(() => {});
}

if (onCloudflareWorkers) {
  (globalThis as { __disposeRequestDb?: typeof disposeRequestClient }).__disposeRequestDb =
    disposeRequestClient;
}

/** Resolves to the right client on every access (see above). */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = currentClient();
    const value: unknown = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type DbClient = PrismaClient;
