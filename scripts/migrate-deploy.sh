#!/usr/bin/env bash
# Railway pre-deploy step (railway.json): apply pending database migrations
# before the new version starts. Needs MIGRATION_DATABASE_URL (the schema-owner
# role); the app's DATABASE_URL role is deliberately not allowed to migrate.
# If this fails, Railway keeps the previous version running.
set -euo pipefail
if [ -z "${MIGRATION_DATABASE_URL:-}" ]; then
  echo "MIGRATION_DATABASE_URL is not set: cannot apply migrations, stopping this deploy." >&2
  exit 1
fi
exec npx prisma migrate deploy
