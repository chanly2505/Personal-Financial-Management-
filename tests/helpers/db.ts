import { prisma } from "@/server/db";

/** Delete all rows from every application table. Integration tests only. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let sequence = 0;

/** Minimal user row for tests that need an owner. Auth fields are placeholders. */
export async function createTestUser(overrides: { email?: string } = {}) {
  sequence += 1;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user${sequence}-${Date.now()}@example.test`,
      passwordHash: "not-a-real-hash",
    },
  });
}

export { prisma };
