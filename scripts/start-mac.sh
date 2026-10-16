#!/usr/bin/env bash
# Personal Finance — update and start the app on a Mac, in one step.
#
#   curl -fsSL https://raw.githubusercontent.com/chanly2505/Personal-Financial-Management-/main/scripts/start-mac.sh | bash
#
# To use a specific folder:  … | bash -s -- ~/Desktop/personal-finance
# Or double-click "Start Personal Finance.command" in the project folder.
# It finds the project, downloads the latest code, makes sure AUTH_URL is set,
# starts PostgreSQL if Homebrew manages it, installs packages, applies database
# migrations, starts the app and opens it in the browser. It never deletes
# anything: local edits are stashed (git stash) and listed.
set -euo pipefail

# The whole script is one block, so bash reads it completely before running —
# safe even when the update below rewrites this file.
{

REPO_URL="https://github.com/chanly2505/Personal-Financial-Management-.git"
APP_URL="http://localhost:3000"

LOG="$HOME/Desktop/personal-finance-log.txt"
mkdir -p "$(dirname "$LOG")"
# Everything shown is also saved to the log, so problems can be shared.
exec > >(tee "$LOG") 2>&1
echo "Personal Finance start — $(date)"
echo "macOS $(sw_vers -productVersion 2>/dev/null || uname -sr) · $(uname -m)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() {
  printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2
  printf '\nA log was saved to: %s\nSend that file (or a screenshot of this window) to Claude.\n' "$LOG" >&2
  exit 1
}

# ---------------------------------------------------------------- tools
command -v git >/dev/null || fail "Git is missing. Install it with: xcode-select --install"
command -v node >/dev/null || fail "Node.js is missing. Install the LTS version (22 or newer) from https://nodejs.org, then run this again."
command -v npm >/dev/null || fail "npm is missing. Reinstall Node.js (22 or newer) from https://nodejs.org"
node_version="$(node -p 'process.versions.node')"
node_major="${node_version%%.*}"
node_minor="$(echo "$node_version" | cut -d. -f2)"
echo "Node $node_version · npm $(npm -v)"
if [ "$node_major" -lt 22 ] || { [ "$node_major" -eq 22 ] && [ "$node_minor" -lt 12 ]; }; then
  fail "Node.js $node_version is too old (this app needs 22.12 or newer). Install the LTS version from https://nodejs.org, close Terminal, and run this again."
fi

# ---------------------------------------------------------------- find the project
# Only a Git checkout of the GitHub repository can be updated. Old copies
# without Git (e.g. an unzipped download) are left untouched: a fresh checkout
# is made instead and their .env is copied over.
is_project() { [ -f "$1/package.json" ] && grep -q '"name": "personal-finance"' "$1/package.json" 2>/dev/null; }
is_checkout() {
  [ -d "$1/.git" ] && git -C "$1" remote get-url origin 2>/dev/null | grep -qi "Personal-Financial-Management-"
}

CANDIDATES=()
if [ -n "${1:-}" ]; then
  target="${1/#\~/$HOME}"
  [ -d "$target" ] || fail "Folder not found: $target"
  is_project "$target" || fail "$target does not look like the Personal Finance project."
  CANDIDATES+=("$(cd "$target" && pwd)")
fi
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
# A folder given on the command line wins, even if another checkout exists.
if [ -n "${1:-}" ]; then PROJECT=""; OLD_COPY="${CANDIDATES[0]}"; is_checkout "$OLD_COPY" && PROJECT="$OLD_COPY"; fi

if [ -z "$PROJECT" ] && [ -n "$OLD_COPY" ]; then
  # Connect the old copy to GitHub in place. Its current files are saved in a
  # git stash first (recoverable); .env and node_modules are not touched.
  PROJECT="$OLD_COPY"
  say "Connecting $PROJECT to GitHub so it can update…"
  cd "$PROJECT"
  [ -d .git ] || git init -q
  git remote remove origin 2>/dev/null || true
  git remote add origin "$REPO_URL"
  git fetch -q origin main || fail "Could not reach GitHub. Check your internet connection and run this again."
  git reset -q origin/main
  if [ -n "$(git status --porcelain)" ]; then
    git stash push -q --include-untracked -m "old files saved when connecting to GitHub $(date '+%Y-%m-%d %H:%M')" || true
    echo "Your old files are saved (git stash list shows them)."
  fi
  git checkout -q -B main origin/main
elif [ -z "$PROJECT" ]; then
  PROJECT="$HOME/Desktop/Personal-Financial-Management-"
  say "Downloading the project to $PROJECT"
  git clone "$REPO_URL" "$PROJECT"
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
say "Installing packages (first time takes a few minutes)…"
if ! npm install --no-audit --no-fund; then
  # npm 10 can fail with "Cannot read properties of null (reading 'edgesOut')"; npm 11 does not.
  say "Retrying the install with a newer npm…"
  npx -y npm@11 install --no-audit --no-fund || fail "Installing packages failed (see the messages above)."
fi
say "Updating the database…"
npx prisma generate >/dev/null || fail "Preparing the database client failed (see the messages above)."
npx prisma migrate deploy || fail "Updating the database failed. Check DATABASE_URL / MIGRATION_DATABASE_URL in .env (see the messages above)."

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
export RECURRING_SCHEDULER="${RECURRING_SCHEDULER:-in-process}"  # post recurring rules hourly while the app runs
exec npm run dev
}
