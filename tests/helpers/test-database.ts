import "dotenv/config";

/**
 * Resolves the integration-test database URL and refuses to continue unless the
 * database name ends in "_test". Tests TRUNCATE every table, so pointing them at
 * a development or production database must be impossible.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against "${dbName}": name must end in "_test".`,
    );
  }
  return url;
}
