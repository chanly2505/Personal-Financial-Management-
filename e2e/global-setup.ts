import { execFileSync } from "node:child_process";

import "dotenv/config";
import { Client } from "pg";

/**
 * Prepare the dedicated e2e database: apply migrations and remove users left by
 * earlier runs. Refuses to touch a database whose name does not end in "_e2e".
 */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set (see .env.example).");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_e2e")) {
    throw new Error(`Refusing to use "${dbName}" for e2e tests: name must end in "_e2e".`);
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url, MIGRATION_DATABASE_URL: url },
    stdio: "pipe",
  });

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DELETE FROM users WHERE email LIKE '%@e2e.test'");
    await client.query("DELETE FROM auth_rate_limits");
  } finally {
    await client.end();
  }
}
