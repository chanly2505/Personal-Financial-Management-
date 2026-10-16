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
# Only a Git checkout of the GitHub repository can be updated. Old copies
# without Git (e.g. an unzipped download) are left untouched: a fresh checkout
# is made instead and their .env is copied over.
is_project() { [ -f "$1/package.json" ] && grep -q '"name": "personal-finance"' "$1/package.json" 2>/dev/null; }
is_checkout() {
  [ -d "$1/.git" ] && git -C "$1" remote get-url origin 2>/dev/null | grep -qi "Personal-Financial-Management-"
}

CANDIDATES=()
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  is_project "$here" && CANDIDATES+=("$here")
fi
while IFS= read -r pkg; do
  dir="$(dirname "$pkg")"
  is_project "$dir" && CANDIDATES+=("$dir")
done < <(find "$HOME/Desktop" "$HOME/Documents" "$HOME/Downloads" "$HOME" -maxdepth 3 \
           -name package.json -not -path "*/node_modules/*" 2>/dev/null | awk '!seen[$0]++')

PROJECT=""
OLD_COPY=""
for dir in "${CANDIDATES[@]+"${CANDIDATES[@]}"}"; do
  if is_checkout "$dir"; then PROJECT="$dir"; break; fi
  [ -z "$OLD_COPY" ] && OLD_COPY="$dir"
done

if [ -z "$PROJECT" ]; then
  PROJECT="$HOME/Desktop/Personal-Financial-Management-"
  [ -e "$PROJECT" ] && PROJECT="$HOME/Desktop/Personal-Finance-App"
  if [ -n "$OLD_COPY" ]; then
    say "Found an old copy without updates at: $OLD_COPY"
    echo "It is left as it is. Downloading an up-to-date copy to: $PROJECT"
  else
    say "Downloading the project to $PROJECT"
  fi
  git clone "$REPO_URL" "$PROJECT"
  if [ -n "$OLD_COPY" ] && [ -f "$OLD_COPY/.env" ] && [ ! -f "$PROJECT/.env" ]; then
    cp "$OLD_COPY/.env" "$PROJECT/.env"
    echo "Copied your settings (.env) from the old copy."
  fi
fi
cd "$PROJECT"
say "Project: $PROJECT"

# ---------------------------------------------------------------- latest code
if [ -n "$(git status --porcelain)" ]; then
  say "Saving your local changes (git stash) so the update can be applied…"
  git stash push --include-untracked -m "auto-saved before update $(date '+%Y-%m-%d %H:%M')"
  echo "Restore them later with: git stash pop"
fi
say "Downloading the latest version…"
git fetch origin main || fail "Could not reach GitHub. Check your internet connection and run this again."
git checkout -q main 2>/dev/null || git checkout -q -b main origin/main
if ! git merge --ff-only -q origin/main; then
  backup="backup-$(date '+%Y%m%d-%H%M%S')"
  git branch "$backup"
  git reset -q --hard origin/main
  echo "Your local commits were kept on branch '$backup'; the app now matches GitHub."
fi
echo "Version: $(git log -1 --format='%h %s (%cd)' --date=short)"

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
