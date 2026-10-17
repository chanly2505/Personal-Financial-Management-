# Operations

How to run the background work the app depends on, and how to recover when something goes wrong.

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
| A platform with HTTP cron (Vercel Cron, Render, Railway, GitHub Actions, cron + curl) | Set `CRON_SECRET` (32+ random characters) and call `GET` or `POST /api/cron/recurring` hourly with `Authorization: Bearer $CRON_SECRET` | Returns only counts: `{ rules, posted, failed, paused, busy }`. 503 while `CRON_SECRET` is unset, 401 for a wrong secret (constant-time comparison). |
| A machine with system cron / launchd / a job runner | `npm run recurring:run` hourly | Loads `.env`, runs once, exits 1 if any rule failed. Example crontab: `5 * * * * cd /srv/personal-finance && npm run recurring:run >> /var/log/pf-recurring.log 2>&1` |

The repository's `vercel.json` schedules `/api/cron/recurring` **daily at 17:05 UTC** (00:05 in Phnom Penh), because Vercel's free Hobby plan allows one run per day (docs/DEPLOYMENT.md). On a paid plan, change the schedule to hourly (`5 * * * *`). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set in the project.

Production scheduling is **off by default** (`RECURRING_SCHEDULER="off"`, no `CRON_SECRET`). Enable it only after the idempotency tests pass in CI (`tests/integration/recurring*.test.ts`).

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
