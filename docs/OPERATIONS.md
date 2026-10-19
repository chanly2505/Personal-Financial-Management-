# Operations

How to run the background work the app depends on, and how to recover when something goes wrong.

## Production runbook

Production = **Railway** (one always-on Node.js service, region US East / Virginia, project `jubilant-unity`) + **Neon** PostgreSQL 17 (AWS US East 2, Ohio — close by, to keep each query a few milliseconds). Live at https://personal-financial-management-production-c29c.up.railway.app. Set-up steps: [DEPLOYMENT.md](DEPLOYMENT.md).

### Environments

| Environment | Where | Database | Secrets |
|---|---|---|---|
| Development | your computer (`npm run dev`, or the Mac launcher) | local PostgreSQL `finance_dev` | `.env` (git-ignored) |
| Tests | local / CI | `finance_test`, `finance_e2e` (truncated by the tests) | test-only values in the test setup |
| CI | GitHub Actions on every push (`.github/workflows/ci.yml`) | throwaway PostgreSQL service | none |
| Production | Railway, branch `main` (every push deploys) | Neon `main` branch, database `neondb` | Railway → service → **Variables** |

Credentials: the app uses `finance_app` (rows only, no schema changes, no role creation); the owner `neondb_owner` is used only for migrations and backups. Rotate a credential by resetting it in Neon (or `ALTER ROLE … PASSWORD`), updating the Railway variable (which redeploys). Rotating `AUTH_SECRET` signs everyone out (intended after a suspected leak).

### Production migrations

- Migrations are committed SQL in `prisma/migrations/` and are **additive** (new tables, columns with defaults, constraints, data normalizations) so that the previous app version keeps working on the new schema.
- **Railway (current):** every deploy runs the pre-deploy command in `railway.json` (`scripts/migrate-deploy.sh` → `prisma migrate deploy` as the owner, using the Railway variable `MIGRATION_DATABASE_URL`) before the new version starts. Pending migrations are applied in order and recorded in `_prisma_migrations`; already-applied ones are skipped. If the variable is missing or a migration fails, Railway stops that deploy and keeps the previous version running — fix the cause and redeploy. Railway runs this from the service settings (Deploy → Pre-deploy command); keep `railway.json` in sync with them.
- To apply by hand: on your computer, `MIGRATION_DATABASE_URL="<owner direct URL>" npx prisma migrate deploy`, then `npx prisma migrate status`.
- **Never** run `prisma migrate reset`, `prisma db push` or hand-written `DROP`/`TRUNCATE` against production. A destructive schema change (drop/rename) needs, in this order: explicit approval, a fresh backup verified with `scripts/verify-backup.sh`, an expand-and-contract plan across two releases, and a written rollback.

### Backups

| Kind | How | When | Retention |
|---|---|---|---|
| Point-in-time history | Neon keeps WAL history; restore to any moment inside the window (hours on Free, days on paid plans — check Project settings → Storage/History) | automatic | per plan |
| Logical dump | `BACKUP_DATABASE_URL="<owner direct URL>" scripts/backup-db.sh` → `~/Documents/personal-finance-backups/personal-finance-<UTC time>.dump` (pg_dump custom format, owner-only file permissions, read-only on the database) | weekly, and before any risky change | keep 8 weekly + 12 monthly; store a copy off the laptop (encrypted drive or cloud folder) |
| Neon snapshot | Neon console → Backup & restore → Create snapshot (or the Neon connector). First one: `p1-before-recurring-request-id-2026-10-19` (19 Oct 2026). Scheduled snapshots are **not available on the Free plan** (checked 19 Oct 2026) | before every release with a migration | until deleted |
| Users' own copies | Settings → Your data (CSV, full JSON) | any time | — |

**Current gap (PROD-4):** on Neon Free the point-in-time window is **6 hours**, and scheduled snapshots are unavailable, so anything noticed later than that depends on the most recent manual snapshot or `pg_dump`. Take a snapshot before each release, and run the weekly dump from the Mac; or upgrade the Neon plan for daily snapshots.

`pg_dump` must be at least the server's major version (Neon 17): `brew install libpq && brew link --force libpq`.

### Reset a forgotten password

There is no email provider yet (`MAIL_TRANSPORT=none`), so "Forgot password?" is replaced by a note on the sign-in page. To reset a user's password, on a computer with the project:

```bash
DATABASE_URL="<production DATABASE_URL from Railway>" npm run user:reset-password -- someone@example.com
```

It prints a temporary password once, signs that user out on every device and clears their sign-in lockout. Give it to them privately; they sign in and change it under Settings → Security. Nothing else about the account changes.

### Who can register

`REGISTRATION_MODE` on Railway: `allowlist` with `REGISTRATION_ALLOWLIST` set to the owner's email (current), `open`, or `closed`. Changing it only affects new sign-ups; existing accounts keep working.

### Recovery test

Monthly (and after changing backup tooling): `scripts/verify-backup.sh <latest .dump>`. It restores into a temporary **local** database, prints row counts and the number of applied migrations, checks that every transaction still has its own account, and drops the temporary database. Record the date and result. A backup that has never been restored is not a backup.

### Restoring production data

Only when data was lost or corrupted (not for routine fixes):

1. Stop writes: in Railway, remove the service's public domain or scale it down (service → Settings), so users see an error instead of writing to bad data.
2. **Point-in-time:** Neon → Branches → *Create branch* from `main` at a time before the incident (or use Neon's restore feature). This leaves `main` untouched.
   **From a dump:** create an empty Neon branch, then `pg_restore --no-owner --no-privileges --dbname="<branch owner URL>" <file.dump>`, and re-run `prisma/sql/app-role-neon.sql` on it.
3. Check the branch: `MIGRATION_DATABASE_URL=<branch owner URL> npx prisma migrate status`, spot-check balances with a test account.
4. Point `DATABASE_URL`/`MIGRATION_DATABASE_URL` in Railway at the restored branch (or make it the primary branch in Neon); Railway redeploys; run the release checks.
5. Keep the old branch until the restore is confirmed; then delete it (explicit decision — deleting is irreversible).

### Rolling back an application deployment

A failed build never goes live — the previous deployment keeps serving. For a bad deployment that is live:

1. Railway → service → **Deployments** → the last good deployment → **⋯ → Rollback** (reuses that build). Or revert the commit on `main` and let Railway deploy it (fix forward).
2. Migrations are not undone by a rollback. Because they are additive, the older code still works on the newer schema. If a migration ever is not backward-compatible, the release must say so and the rollback plan must include the schema step.
3. After rolling back, the next push to `main` deploys again — fix the problem before pushing.

### Failed migration

Symptom: the Railway deployment fails at the **pre-deploy** stage (`prisma migrate deploy`); **the previous version stays live** and the database is unchanged except possibly by the failing migration. A wrong or outdated `MIGRATION_DATABASE_URL` shows as `P1000: Authentication failed` (19 Oct 2026: fixed by copying the current owner address from Neon).

1. Read the error in the deployment's logs. Run `MIGRATION_DATABASE_URL=<owner direct URL> npx prisma migrate status` from your computer: it names the failed migration.
2. If the migration failed before changing anything (e.g. a constraint that existing rows violate): fix the migration *or the data* in a **new** commit (data fixes go in their own migration), then mark the failed attempt as rolled back: `npx prisma migrate resolve --rolled-back <migration_name>` and redeploy.
3. If it partially applied: inspect what exists (`\d table` in `psql` as the owner), write a corrective migration, mark the failed one `--rolled-back` (or `--applied` if you completed it by hand exactly as written), and redeploy. Take a dump first.
4. Never edit a migration that has already been applied in production, and never delete rows from `_prisma_migrations` by hand.

### Database outage

Symptoms: pages show "We couldn't load this page", `/api/health` returns **503** `{"database":"unreachable"}`, logs show `PrismaClientInitializationError` / connection errors.

1. Check [Neon status](https://neonstatus.com) and the project in the Neon console (compute suspended? quota exceeded? password changed?).
2. Free Neon computes sleep when idle and wake on the next connection (a slower first request is normal, not an outage).
3. No data is lost by an outage: writes fail with an error the user sees; nothing is half-written (every multi-row change is one transaction). Recurring posting resumes on the next scheduled run and catches up dates that fell due (max 50 per rule per run).
4. If the outage is long and data is at risk, follow "Restoring production data".
5. Afterwards: `/api/health` → 200, run `npm run release:check`.

### Monitoring and error reporting

- **Health:** `GET /api/health` → 200 `{"status":"ok","database":"ok","version":"<commit>"}`. Point a free uptime monitor (e.g. UptimeRobot, 5-minute interval) at it to get an e-mail when it fails; checking every few minutes keeps a free Neon compute awake, so use ≥ 5 minutes.
- **Errors:** the app writes one-line JSON logs (event name, ids, error class — never passwords, tokens, amounts or record text) to Railway → service → **Logs** (deployment logs; HTTP logs show every request's status). Filter by `"level":"error"`. Key events: `route.failed`, `action.failed`, `recurring.run_failed`, `recurring.rule_failed`, `auth.rate_limited`, `security.ip_rate_limits_disabled`, `export.failed`.
- **Scheduled job:** with `RECURRING_SCHEDULER=in-process` the server runs it 30 s after start and then hourly; look for `recurring.run_finished` in the logs. Keep Railway's App Sleeping off, or recurring items wait until the app wakes.
- No third-party analytics or error-tracking SDK is included (product decision); a log drain or error service can be added later without code changes to the logger format.

### Release checks

After each production deploy that changes behaviour: `RELEASE_URL=https://<address> RELEASE_CRON_SECRET=<secret> npm run release:check`. It verifies health and headers, that protected pages/APIs refuse anonymous access, registration and sign-in, accounts, income/expense, a transfer, balances, a budget, the dashboard, reports and CSV export, isolation between two users, phone layout and the scheduled job — using throwaway `release-check-…@example.test` accounts with made-up data that it deletes at the end (also when a check fails). Each run creates two accounts; with the production limit of 5 sign-ups per IP per hour, run it at most twice an hour from one machine. If the site is so broken that the check cannot reach Settings, its throwaway account stays behind (sample data only); remove it in Neon's SQL Editor with `DELETE FROM users WHERE email LIKE 'release-check-%@example.test';` (every record of those accounts goes with it).

The check calls the cron endpoint, which really runs the recurring job (posting anything due, exactly as the daily schedule would) — harmless, since runs are idempotent.

## Recurring transactions scheduler

Every scheduled run (`runScheduledJobs`, `src/server/scheduled-jobs.ts`) posts due recurring transactions and then removes expired sign-in rate-limit windows (housekeeping; a failure there never affects postings).

Recurring rules (PRD §6.6) are posted by one engine, `runDueRules()` in `src/features/recurring/server/service.ts`. **Opening a page never posts anything.** The engine runs only when a scheduler calls it, and is safe to call at any time, repeatedly and concurrently:

| Guarantee | How |
|---|---|
| An occurrence is posted at most once | `transactions (recurring_rule_id, recurrence_date)` is unique; inserts use `ON CONFLICT DO NOTHING` |
| Workers never process the same rule at the same time | each rule is locked with `SELECT … FOR UPDATE SKIP LOCKED` inside its own database transaction; a second worker skips it |
| Posting and the next date move together | the transaction insert, the history row and `next_occurrence_on` are written in one database transaction |
| A failure never blocks other rules | each rule is processed and committed separately; failures are recorded and the run continues |
| Bounded work | at most 500 rules per run and 50 occurrences per rule per run; the next run continues |

**Time zones.** Scheduling instants are UTC. Each rule's dates are calendar dates in its owner's timezone; a rule is *due* when its next date is on or before "today" in that timezone at the moment of the run. Run the scheduler **hourly** so every timezone gets its day's postings within the hour.

### Choose one scheduler (any combination is also safe)

| Hosting | Configure | Notes |
|---|---|---|
| A single self-hosted server (e.g. your Mac) | `RECURRING_SCHEDULER="in-process"` | Runs 30 s after the server starts, then hourly, inside the app process (`src/instrumentation.ts`). The Mac launcher (`scripts/start-mac.sh`) turns this on. Posts only while the app is running; missed hours catch up on the next run. |
| A platform with HTTP cron (a Railway cron service, GitHub Actions, cron + curl) | Set `CRON_SECRET` (32+ random characters) and call `GET` or `POST /api/cron/recurring` hourly with `Authorization: Bearer $CRON_SECRET` | Returns only counts: `{ rules, posted, failed, paused, busy }`. 503 while `CRON_SECRET` is unset, 401 for a wrong secret (constant-time comparison). |
| A machine with system cron / launchd / a job runner | `npm run recurring:run` hourly | Loads `.env`, runs once, exits 1 if any rule failed. Example crontab: `5 * * * * cd /srv/personal-finance && npm run recurring:run >> /var/log/pf-recurring.log 2>&1` |

The app default is off (`RECURRING_SCHEDULER="off"`, no `CRON_SECRET`). **Production (Railway) runs `RECURRING_SCHEDULER="in-process"`** on its single always-on service; the idempotency tests (`tests/integration/recurring*.test.ts`) run in CI on every push.

### Catch-up policy

- **New rule:** the first posting is the first date on or after today. Past dates are posted only if the user ticks "Also record the N past occurrences" (start date at most one year back).
- **Scheduler downtime:** dates that fell due while a rule was *active* are posted by the next run, oldest first, each with its own date (50 per rule per run).
- **Paused rules:** nothing is posted while paused; on resume the paused period is skipped (Q-5).
- **Edits:** only dates not yet posted change; a date that was already posted is never posted again. Editing an **active** rule keeps dates that were due but not yet posted (e.g. after downtime or a catch-up request) — they are posted with the new details. Editing a paused rule keeps skipping the pause (Q-5).
- **Timezones:** a user's timezone must be readable by PostgreSQL; Settings only offers names that are (old aliases are stored by their current name). If a stored value is ever unreadable (e.g. a different database build), only that user's rules are skipped — the run continues for everyone else.

### Failure handling

- Each attempt is recorded in `recurring_runs` (one row per rule and occurrence date) with a **safe reason code** (`database_error`, `unexpected_error`, `account_archived`, `category_archived`) — never amounts, names, SQL or raw error messages.
- Logs carry ids, counts and the error class only: `recurring.run_finished`, `recurring.rule_failed`, `recurring.rule_paused`, `recurring.scheduler_started`, `recurring.scheduler_tick_failed`, `recurring.run_failed`.
- A failed occurrence is retried on every later run. After **5** failed attempts the rule is paused (`REPEATED_FAILURES`) so the user sees it on the Recurring page.
- If the rule's account or category is archived, the run records `SKIPPED` and pauses the rule (`ACCOUNT_ARCHIVED` / `CATEGORY_ARCHIVED`). The user restores the account or category (or edits the rule) and resumes.

### Recovery runbook

1. **See what failed** — Recurring page (users) or the database:
   ```sql
   SELECT r.id, r.name, run.occurrence_on, run.status, run.reason, run.attempts, run.last_attempt_at
   FROM recurring_runs run JOIN recurring_rules r ON r.id = run.rule_id
   WHERE run.status <> 'POSTED' ORDER BY run.last_attempt_at DESC LIMIT 50;
   ```
2. **Fix the cause** — database reachable (`/api/health`), migrations applied (`npm run db:status`), account/category restored.
3. **Re-run** — `npm run recurring:run` (or call the cron endpoint). Re-running is always safe: nothing already posted is posted again.
4. **Resume paused rules** — the user (or support, with the user's consent) presses *Resume*. Dates during the pause are skipped by design; to record a specific missed date, add it as a normal transaction.
5. **Stop everything quickly** — set `RECURRING_SCHEDULER="off"` and remove `CRON_SECRET` (or the platform cron), then restart.

### Checking it is working

- `recurring.run_finished` appears hourly in the logs with `failed: 0`.
- Rules due today show "Due — posts on the next scheduled run" until the next run; afterwards their history shows *Posted*.
