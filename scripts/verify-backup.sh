#!/usr/bin/env bash
# Recovery test (docs/OPERATIONS.md §Recovery test): restore a backup into a
# throwaway LOCAL database, check it, and drop it again. Never touches the
# production database.
#
#   scripts/verify-backup.sh path/to/personal-finance-YYYYMMDD-HHMMSSZ.dump
#
# Needs a local PostgreSQL you can create databases on (e.g. Postgres.app or
# `brew services start postgresql`). Override with VERIFY_ADMIN_URL.
set -euo pipefail

dump="${1:-}"
[ -f "$dump" ] || { echo "Usage: scripts/verify-backup.sh <file.dump>" >&2; exit 2; }
# Prisma-style URLs carry ?schema=…, which psql does not accept: drop it.
admin=$(printf '%s' "${VERIFY_ADMIN_URL:-postgresql:///postgres}" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')
scratch="pf_restore_check_$(date +%s)"
# Swap the database name in the admin URL, keeping any ?options.
query=""; case "$admin" in *\?*) query="?${admin#*\?}";; esac
noquery="${admin%%\?*}"
target="${noquery%/*}/$scratch$query"

# A dump restores reliably only into the same or a newer PostgreSQL major
# version (Neon runs 17; e.g. `brew install postgresql@17`).
dumped=$(pg_restore -l "$dump" | sed -n 's/^;[[:space:]]*Dumped from database version: \([0-9]*\).*/\1/p' | head -1)
version_num=$(psql "$admin" -qtAc "SHOW server_version_num") || {
  echo "Cannot connect to the local PostgreSQL at VERIFY_ADMIN_URL." >&2
  exit 2
}
local_major=$((version_num / 10000))
if [ -n "$dumped" ] && [ "$local_major" -lt "$dumped" ]; then
  echo "This backup is from PostgreSQL $dumped but the local server is $local_major." >&2
  echo "Install PostgreSQL $dumped or newer locally (or restore into a Neon branch, OPERATIONS.md)." >&2
  exit 2
fi

cleanup() { psql "$admin" -qtAc "DROP DATABASE IF EXISTS \"$scratch\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql "$admin" -qtAc "CREATE DATABASE \"$scratch\""
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$target" "$dump"

echo "Restored into a temporary database. Row counts:"
psql "$target" -qtA -F' ' -c "
  SELECT 'users', count(*) FROM users UNION ALL
  SELECT 'accounts', count(*) FROM accounts UNION ALL
  SELECT 'transactions', count(*) FROM transactions UNION ALL
  SELECT 'transfers', count(*) FROM transfers UNION ALL
  SELECT 'budgets', count(*) FROM budgets UNION ALL
  SELECT 'recurring_rules', count(*) FROM recurring_rules UNION ALL
  SELECT 'savings_goals', count(*) FROM savings_goals UNION ALL
  SELECT 'applied migrations', count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL"

# Integrity: every transaction's account belongs to the same user (composite
# foreign keys make this impossible to break; a restore must keep it).
orphans=$(psql "$target" -qtAc "
  SELECT count(*) FROM transactions t
  LEFT JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id
  WHERE a.id IS NULL")
[ "$orphans" = "0" ] || { echo "FAILED: $orphans transactions without their account." >&2; exit 1; }
echo "Recovery test passed (temporary database removed)."
