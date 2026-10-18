#!/usr/bin/env bash
# Build for Cloudflare Workers (docs/DEPLOYMENT.md §Cloudflare).
#
# 1. Production builds only (Workers Builds on the `main` branch): apply
#    pending database migrations with MIGRATION_DATABASE_URL (build variable).
# 2. Generate the Prisma client for the workerd runtime (its query engine is
#    imported as a WebAssembly module; Workers cannot compile it at runtime).
# 3. Build the Next.js app with the OpenNext adapter into .open-next/, without
#    src/instrumentation.ts: it only starts the optional in-process scheduler
#    (Workers use the cron trigger instead), and Next.js traces the whole of
#    node_modules for it. Together with CF_BUILD=1 (tracing excludes in
#    next.config.ts) this keeps the Worker within its upload size limit
#    (≈5 MB compressed instead of ≈20 MB).
# Run locally, it restores instrumentation.ts and the Node.js Prisma client.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${WORKERS_CI_BRANCH:-}" = "main" ] || [ "${CF_RUN_MIGRATIONS:-}" = "1" ]; then
  if [ -z "${MIGRATION_DATABASE_URL:-}" ]; then
    echo "MIGRATION_DATABASE_URL is not set: add it as a build variable (Settings → Build)." >&2
    exit 1
  fi
  npx prisma migrate deploy
fi

restore() {
  if [ -f .cf-build/instrumentation.ts ]; then mv .cf-build/instrumentation.ts src/instrumentation.ts; fi
  rm -rf .cf-build prisma/schema.workerd.prisma
  if [ -z "${WORKERS_CI:-}" ]; then npx prisma generate >/dev/null; fi
}
trap restore EXIT

sed 's#^\(\s*output\s*=.*\)$#\1\n  runtime  = "workerd"#' prisma/schema.prisma > prisma/schema.workerd.prisma
grep -q 'runtime  = "workerd"' prisma/schema.workerd.prisma
npx prisma generate --schema prisma/schema.workerd.prisma

mkdir -p .cf-build && mv src/instrumentation.ts .cf-build/instrumentation.ts
CF_BUILD=1 npx opennextjs-cloudflare build
