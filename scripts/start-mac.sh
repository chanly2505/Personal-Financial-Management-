#!/usr/bin/env bash
# Personal Finance — update and start the app on a Mac, in one step.
#
#   curl -fsSL https://raw.githubusercontent.com/chanly2505/Personal-Financial-Management-/main/scripts/start-mac.sh | bash
#
# Or double-click "Start Personal Finance.command" in the project folder.
# It finds the project, downloads the latest code, makes sure AUTH_URL is set,
# starts PostgreSQL if Homebrew manages it, installs packages, applies database
# migrations, starts the app and opens it in the browser. It never deletes
# anything: local edits are stashed (git stash) and listed.
set -euo pipefail

REPO_URL="https://github.com/chanly2505/Personal-Financial-Management-.git"
APP_URL="http://localhost:3000"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- tools
command -v git >/dev/null || fail "Git is missing. Install it with: xcode-select --install"
command -v node >/dev/null || fail "Node.js is missing. Install the LTS version from https://nodejs.org"
command -v npm >/dev/null || fail "npm is missing. Reinstall Node.js from https://nodejs.org"

# ---------------------------------------------------------------- find the project
is_project() { [ -f "$1/package.json" ] && grep -q '"name": "personal-finance"' "$1/package.json" 2>/dev/null; }

PROJECT=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  candidate="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  is_project "$candidate" && PROJECT="$candidate"
fi
if [ -z "$PROJECT" ]; then
  while IFS= read -r pkg; do
    dir="$(dirname "$pkg")"
    if is_project "$dir"; then PROJECT="$dir"; break; fi
  done < <(find "$HOME/Desktop" "$HOME/Documents" "$HOME/Downloads" "$HOME" -maxdepth 3 \
             -name package.json -not -path "*/node_modules/*" 2>/dev/null)
fi
if [ -z "$PROJECT" ]; then
  PROJECT="$HOME/Desktop/Personal-Financial-Management-"
  say "Project not found — downloading it to $PROJECT"
  git clone "$REPO_URL" "$PROJECT"
fi
cd "$PROJECT"
say "Project: $PROJECT"

# ---------------------------------------------------------------- latest code
if [ -d .git ]; then
  if [ -n "$(git status --porcelain)" ]; then
    say "Saving your local changes (git stash) so the update can be applied…"
    git stash push --include-untracked -m "auto-saved before update $(date '+%Y-%m-%d %H:%M')"
    echo "Restore them later with: git stash pop"
  fi
  say "Downloading the latest version…"
  git pull --ff-only origin main || fail "Could not update. Send the message above to Claude."
fi

# ---------------------------------------------------------------- settings
[ -f .env ] || fail ".env is missing in $PROJECT. Copy .env.example to .env and fill it in (see README → Setup)."
if ! grep -q '^AUTH_URL=' .env; then
  printf '\nAUTH_URL="%s"\n' "$APP_URL" >> .env
  echo "Added AUTH_URL to .env"
fi

# ---------------------------------------------------------------- database server
db_ready() { pg_isready -q 2>/dev/null || pg_isready -q -h localhost 2>/dev/null; }
if command -v pg_isready >/dev/null && ! db_ready; then
  if command -v brew >/dev/null; then
    service="$(brew services list 2>/dev/null | awk '/^postgresql/ {print $1; exit}')"
    if [ -n "$service" ]; then
      say "Starting PostgreSQL ($service)…"
      brew services start "$service" >/dev/null
      for _ in $(seq 1 20); do db_ready && break; sleep 1; done
    fi
  fi
  db_ready || fail "PostgreSQL is not running. Start it (e.g. open Postgres.app) and run this again."
fi

# ---------------------------------------------------------------- packages + migrations
say "Installing packages and updating the database (first time takes a few minutes)…"
npm run setup || fail "Setup failed. Send the message above to Claude."

# ---------------------------------------------------------------- start
if lsof -ti tcp:3000 >/dev/null 2>&1; then
  say "Port 3000 is in use — stopping the old app first…"
  lsof -ti tcp:3000 | xargs kill 2>/dev/null || true
  sleep 1
fi
say "Starting the app at $APP_URL (keep this window open; close it to stop the app)…"
( for _ in $(seq 1 60); do
    if curl -fs "$APP_URL/api/health" >/dev/null 2>&1; then open "$APP_URL"; exit 0; fi
    sleep 2
  done ) &
exec npm run dev
