import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI (migrate, studio, seed) connects as the schema owner when
 * MIGRATION_DATABASE_URL is set; the running app uses the least-privilege
 * DATABASE_URL role (see prisma/sql/app-role.sql and docs/SECURITY.md §8).
 */
// Optional here: `prisma generate` (run by `npm install` on build servers) needs
// no database, so a missing URL must not fail installs. Commands that connect
// (migrate, studio, seed) still stop with Prisma's own "url is required" error.
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  ...(url && { datasource: { url } }),
});
