import { getTestDatabaseUrl } from "../helpers/test-database";

// Point application code (src/server/env.ts, src/server/db.ts) at the test database.
// Vitest already sets NODE_ENV=test.
process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.MIGRATION_DATABASE_URL = getTestDatabaseUrl();
// Integration tests never use a real secret or real mail delivery.
process.env.AUTH_SECRET = "integration-test-secret-integration-test-secret";
process.env.MAIL_TRANSPORT = "console";
process.env.APP_URL = "http://localhost:3000";
