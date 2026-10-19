#!/usr/bin/env bash
# `npm run build`: a normal Next.js build everywhere except Cloudflare Workers
# Builds (WORKERS_CI=1), where it produces the Workers bundle instead, so the
# dashboard's default build command works (docs/DEPLOYMENT.md §Cloudflare).
set -euo pipefail
if [ -n "${WORKERS_CI:-}" ]; then
  exec bash "$(dirname "$0")/cloudflare-build.sh"
fi
exec next build
