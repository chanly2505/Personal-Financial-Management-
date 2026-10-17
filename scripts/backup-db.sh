#!/usr/bin/env bash
# Logical backup of a Personal Finance database (docs/OPERATIONS.md §Backups).
#
#   BACKUP_DATABASE_URL="postgresql://neondb_owner:…@ep-…neon.tech/neondb?sslmode=require" \
#     scripts/backup-db.sh [output-directory]
#
# - Read-only: pg_dump never changes the database.
# - Use the owner's *direct* (non-pooled) connection string; pg_dump's major
#   version must be >= the server's (Neon: PostgreSQL 17 → `brew install libpq`).
# - The dump contains every user's financial data: it is written with
#   owner-only permissions, outside the repository by default. Keep it private.
set -euo pipefail

url="${BACKUP_DATABASE_URL:-}"
[ -n "$url" ] || { echo "Set BACKUP_DATABASE_URL to the owner's direct connection string." >&2; exit 2; }
command -v pg_dump >/dev/null || { echo "pg_dump not found. On a Mac: brew install libpq && brew link --force libpq" >&2; exit 2; }

dir="${1:-$HOME/Documents/personal-finance-backups}"
mkdir -p "$dir"
chmod 700 "$dir"
file="$dir/personal-finance-$(date -u +%Y%m%d-%H%M%SZ).dump"

umask 077
pg_dump --format=custom --no-owner --no-privileges --file="$file" "$url"
echo "Backup written: $file ($(du -h "$file" | cut -f1))"
echo "Check it with: scripts/verify-backup.sh \"$file\""
