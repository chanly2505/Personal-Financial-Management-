/**
 * Owner-run password reset, for when a user is locked out and no email
 * provider is configured (docs/OPERATIONS.md "Reset a forgotten password"):
 *
 *   npm run user:reset-password -- someone@example.com
 *
 * Needs DATABASE_URL for the production database. Prints a temporary password
 * once; the user signs in with it and changes it under Settings → Security.
 * Every existing session of that user is signed out.
 */
import "dotenv/config";

import { resetPasswordByOperator } from "@/features/auth/server/service";
import { prisma } from "@/server/db";

async function main() {
  const email = process.argv[2];
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run user:reset-password -- someone@example.com");
    process.exitCode = 2;
    return;
  }
  const temporary = await resetPasswordByOperator(email);
  if (!temporary) {
    console.error("No account uses that email. Nothing was changed.");
    process.exitCode = 1;
    return;
  }
  console.log("Password reset. All of this user's sessions were signed out.");
  console.log(`Temporary password (shown once): ${temporary}`);
  console.log("Ask them to sign in with it and change it under Settings → Security.");
}

main()
  .catch((error: unknown) => {
    console.error(`Reset failed: ${error instanceof Error ? error.name : typeof error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
