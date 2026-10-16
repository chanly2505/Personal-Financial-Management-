import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI (migrate, studio, seed) connects as the schema owner when
 * MIGRATION_DATABASE_URL is set; the running app uses the least-privilege
 * DATABASE_URL role (see prisma/sql/app-role.sql and docs/SECURITY.md §8).
 */
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL (and optionally MIGRATION_DATABASE_URL) in .env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: { url },
});
