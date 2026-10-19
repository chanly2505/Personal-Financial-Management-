#!/usr/bin/env bash
# Build for Cloudflare Workers (docs/DEPLOYMENT.md §Cloudflare).
#
# 1. Production builds only (Workers Builds on the `main` branch): apply
#    pending database migrations when MIGRATION_DATABASE_URL (build variable)
#    is set; otherwise they are applied separately and the build says so.
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
  if [ -n "${MIGRATION_DATABASE_URL:-}" ]; then
    npx prisma migrate deploy
  else
    # Without the owner's address the schema is managed outside the build
    # (docs/DEPLOYMENT.md §Cloudflare: migrations applied through Neon).
    echo "NOTE: MIGRATION_DATABASE_URL is not set, so database migrations are not applied by this build." >&2
    echo "      Apply new migrations before deploying code that needs them (docs/DEPLOYMENT.md)." >&2
  fi
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
