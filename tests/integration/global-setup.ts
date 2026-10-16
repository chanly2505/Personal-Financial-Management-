import { execFileSync } from "node:child_process";

import { getTestDatabaseUrl } from "../helpers/test-database";

/** Bring the test database schema up to date once per run. */
export default function setup() {
  const url = getTestDatabaseUrl();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    // Both variables: prisma.config.ts prefers MIGRATION_DATABASE_URL, which .env sets to the dev DB.
    env: { ...process.env, DATABASE_URL: url, MIGRATION_DATABASE_URL: url },
    stdio: "pipe",
  });
}
