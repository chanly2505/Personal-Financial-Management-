# QA and security audit — Phase 11

**Date:** 17 October 2026 · **Baseline:** commit `5f2455f` (end of Phase 10) · **Scope:** the whole repository — routes, server actions, route handlers, schema and migrations, authentication and authorization, services, financial calculations, forms, scheduled jobs, reports and exports, error handling, tests, production and deployment configuration.

**Method.** Evidence comes from the code and from running it, not from the UI existing:

1. Three independent read-only reviews (authorization/injection, financial logic, configuration/dependencies). Every finding was then **reproduced** with a failing automated test (or a direct check against PostgreSQL / Node) before it was accepted, and the test was re-run after the fix. For fixes written test-first-in-reverse (QA-12/13/14), the old code was temporarily restored to confirm the test fails without the fix.
2. An **independent reconciliation** test (`tests/integration/reconciliation.test.ts`): 160 seeded pseudo-random operations — income, expenses, transfers, edits that move records between accounts and currencies, deletions, reversals, future-dated records, month ends — go through the real services while the test keeps its own model in plain integer arithmetic. Balances (current and projected), ledger totals, dashboard, reports (series, buckets, account history), budget spent and the CSV export are compared with the model.
3. `npm audit`, direct checks of timezone handling in Node vs PostgreSQL, and a full run of every automated suite.

No production system or real user data was accessed; all tests ran against local test databases.

## Summary

| Severity | Found | Fixed | Open |
|---|---|---|---|
| P0 — critical exposure / corruption / security failure | 0 | — | 0 |
| P1 — major broken functionality or wrong financial figures | 2 | 2 | 0 |
| P2 — significant usability, reliability, security hardening | 8 | 8 | 0 (5 accepted risks below are P2/P3) |
| P3 — minor | 9 | 9 | see accepted risks |

No cross-user data access, IDOR, SQL injection or XSS was found (details in "Verified").

## Findings

### QA-01 · P1 · One user's timezone could stop recurring postings for every user — fixed

- **Reproduction:** on the bundled PostgreSQL 16 (Ubuntu 24.04 tzdata, without legacy aliases), choose *Asia/Saigon* (or *Asia/Calcutta*, *Europe/Kiev* … 18 names) from **Settings → Timezone** — the dropdown offered them — or submit `US/Pacific-New` / `+01:00`. Create any active recurring rule. Every scheduled run then fails with `time zone "Asia/Saigon" not recognized` before processing any rule: nobody's recurring income or bills are posted.
- **Root cause:** validation accepted anything `Intl.DateTimeFormat` accepts; Node's IANA list still uses 18 old aliases that this PostgreSQL rejects; `findDueRules` evaluates `AT TIME ZONE u.timezone` for all users in one query. Offsets like `+01:00` are also read with the opposite sign by PostgreSQL (POSIX) — "today" would differ between SQL and the app.
- **Fix:** timezone choices = runtime IANA list with old aliases mapped to current names (`LEGACY_TIME_ZONES`), plus `UTC`; no offsets or removed names; old aliases submitted are stored by their current name. Data migration normalizes stored values. The due-rules query skips (instead of failing on) a timezone the database cannot read.
- **Files:** `src/lib/dates.ts`, `src/features/settings/schemas.ts`, `src/app/(app)/settings/page.tsx`, `src/features/recurring/server/repository.ts`, `prisma/migrations/20261017120000_normalize_timezones/`.
- **Tests:** `audit-regressions.test.ts` QA-01 (schema rules; *every timezone offered in Settings is readable by PostgreSQL*; a user with an unreadable stored timezone does not stop another user's posting).

### QA-02 · P1 · An archived account's opening balance could be changed, removing money from totals — fixed

- **Reproduction:** archive an account (balance 0), open `/accounts/<id>/edit`, set the opening balance to 500 → the account holds $500, but archived accounts are excluded from totals, so the USD total silently drops by $500. Also possible by racing an edit against "Archive" (reproduced on the first attempt).
- **Root cause:** `updateAccount` never checked `isArchived` and took no lock, while archiving checks the balance under `FOR UPDATE`.
- **Fix:** archived accounts cannot be edited (service check + `FOR UPDATE` re-check in the same transaction as the update); the Edit button is hidden and the edit page explains how to restore.
- **Files:** `src/features/accounts/server/{service,repository}.ts`, `src/features/accounts/components/account-actions.tsx`, `src/app/(app)/accounts/[id]/edit/page.tsx`.
- **Tests:** QA-02 (refusal + totals unchanged; edit-vs-archive race ×6) · `e2e/accounts.spec.ts` (no Edit on archived account; edit page refuses).

### QA-03 · P2 · A goal's currency could change while a contribution was being saved — fixed

- **Reproduction:** USD goal without contributions; submit "10.50" while saving the goal as KHR in another tab → KHR goal with 1,050 riel saved (intended $10.50). Reproduced on the first round.
- **Root cause:** the amount was parsed with the currency read before the lock; the currency-change check counted contributions without the goal's row lock.
- **Fix:** both operations take the goal's row lock; a contribution re-checks the currency under the lock (conflict → "reload"); a currency change re-counts contributions under the lock.
- **Files:** `src/features/goals/server/{service,repository}.ts`. **Tests:** QA-03 (race ×8).

### QA-04 · P2 · Reversing a future-dated transfer moved today's balances — fixed

- **Reproduction:** transfer $40 A→B dated in 30 days, reverse it → the reversal was dated today, so A's *current* balance rose by $40 and B's fell by $40 until the original date.
- **Fix:** a reversal is dated today or on the original's date, whichever is later.
- **Files:** `src/features/transactions/server/{service,repository}.ts`, `record-actions.tsx` (wording). **Tests:** QA-04 (future and past cases); the reconciliation model.

### QA-07 · P2 · Editing an active recurring rule silently dropped its pending catch-up dates — fixed

- **Reproduction:** create a weekly rule starting 100 days ago with "record past occurrences", rename it before the next run → the 15 past occurrences are never posted.
- **Root cause:** after an edit the next date was recomputed from today. PRD §6.6 says only *unposted* dates change on edit.
- **Fix:** editing an active rule keeps dates that were due but not posted (never re-posting posted dates); paused rules still skip the pause (Q-5).
- **Files:** `src/features/recurring/server/service.ts`. **Tests:** QA-07; `recurring.test.ts` updated to the documented behaviour.

### QA-12 · P2 · Registration had no limit when the client IP is unknown — fixed

- **Reproduction:** with `TRUSTED_IP_HEADER` unset (the default), unlimited sign-ups, each costing an argon2 hash.
- **Fix:** a shared limit applies when the IP is unknown (`REGISTRATION_LIMIT_WITHOUT_IP`, default 30/hour; the end-to-end suite raises it because it registers hundreds of users without an IP); production start-up logs `security.ip_rate_limits_disabled` if the header is not configured.
- **Files:** `src/server/auth/rate-limit.ts`, `src/server/env.ts`, `src/features/auth/server/service.ts`, `src/instrumentation.ts`, `.env.example`, `playwright.config.ts`. **Tests:** QA-12 (fails on the old code).

### QA-15 · P2 · Deployment guide would have created a non-least-privilege database user — fixed (documentation)

- **Finding:** `docs/DEPLOYMENT.md` said to create `finance_app` with Neon's "New role" button. Neon documents that console-created roles join `neon_superuser` (CREATEROLE, CREATEDB), defeating the limited role.
- **Fix:** the role is created by `prisma/sql/app-role-neon.sql` (which also revokes `neon_superuser` membership if present); guide updated. Script dry-run in a rolled-back transaction on PostgreSQL 16. *Not verified on Neon itself.*

### QA-16 · P2 · Guide did not restrict secrets to Production on Vercel — fixed (documentation)

Every pushed branch would have run with the production database and secrets. The guide now requires *Production only* for each variable and documents the owner-URL exposure (see accepted risks).

### QA-17 · P2 · The Mac launcher exposed the app to the local network — fixed

`next dev` listens on all interfaces, so anyone on the same Wi-Fi could reach the app over plain HTTP. The launcher now binds to `127.0.0.1` (verified: localhost 200, network address refused).

### QA-05 · P3 · "Compare periods" used the wrong previous period for Last 30/90 days at month boundaries — fixed

Last 30 days on 30 Sep (= 1–30 Sep) compared with all of August (31 days) instead of 2–31 Aug. Rolling presets now always compare equal lengths. `src/features/reports/period.ts`; `tests/unit/report-period.test.ts`.

### QA-06 · P3 · A budget warning that came back showed an old spent amount — fixed

Re-activation now refreshes `spent_minor`. `src/features/budgets/server/repository.ts`; QA-06.

### QA-08 · P3 · A goal's history could go negative on a past date — fixed

A withdrawal could be backdated before the deposit it relies on, or a deposit deleted that an earlier withdrawal needed. The running saved amount is now checked at every date under the lock. `src/features/goals/server/service.ts`; QA-08.

### QA-09 · P3 · An amount filter above the largest amount matched the largest records — fixed

A minimum above the storable maximum now matches nothing. `src/features/transactions/server/service.ts`; QA-09.

### QA-10 · P3 · `npm run test:unit` failed when run on its own — fixed

Two unit files import the environment validator; only the full run had environment values. Added `tests/unit/setup-env.ts` (harmless placeholders).

### QA-11 · P3 · Unused Firebase products pulled a vulnerable gRPC library — fixed

The app only initializes Firebase in the browser; `firebase` pulled Firestore and `@grpc/grpc-js@1.9.16` (GHSA-m9gg-hp2v-232j, not reachable). Replaced with `@firebase/app@0.16.3` — the same version already installed — removing 4 high advisories.

### QA-13 · P3 · Rate-limit records were never cleaned up — fixed

`pruneRateLimits()` had no caller. Every scheduled run now prunes expired windows (`src/server/scheduled-jobs.ts`); QA-13.

### QA-14 · P3 · A password-reset link could be used twice by two simultaneous submissions — fixed

The token is now consumed atomically in the password-change transaction. (Recovery is disabled in production until an e-mail provider is chosen.) QA-14.

### QA-18 · P3 · Conflicting guidance on the trusted IP header — fixed

`.env.example` said `x-forwarded-for` for Vercel; the guide said `x-real-ip`. Both now say `x-real-ip`.

### QA-19 · P3 · Defence in depth: a goal contribution was deleted by id only — fixed

Not exploitable (preceded by a user-scoped lookup under lock); the delete is now also scoped by user and goal.

## Accepted risks and known limitations (not fixed)

| # | Item | Severity | Why accepted / mitigation | Action |
|---|---|---|---|---|
| R1 | `prisma@7.10.0` (CLI): `deepmerge-ts`, `mysql2` advisories (4 high in `npm audit --omit=dev`) | P3 | Build/migrate-time tool only; the MySQL driver is never loaded; config objects are our own. The fix (7.10.1) was published on 15 Oct 2026 — two days before this audit. | Upgrade `prisma`, `@prisma/client`, `@prisma/adapter-pg` to 7.10.1 on or after 29 Oct 2026, re-run all suites. |
| R2 | `next-auth` 5.0.0-beta.32 | P3 | No advisories; widely used; sessions additionally verified against the database on every request. | Move to the stable release when available. |
| R3 | Registration reveals whether an email is registered (distinct message, faster response) | P3 | Mitigated by rate limits; a real fix needs e-mail verification (Q-12). | Revisit with Q-12. |
| R4 | Anyone can lock a victim's sign-in for 15 minutes (per-email limit) | P3 | Standard trade-off against password guessing. | — |
| R5 | `MIGRATION_DATABASE_URL` (owner) is readable by the running app on Vercel | P2 | The app never reads it; documented mitigation (mark Sensitive, or run migrations outside Vercel). | Choose per deployment. |
| R6 | CSP allows inline styles (`style-src 'unsafe-inline'`); HSTS without `preload` | P3 | Needed by UI libraries for inline style attributes; scripts are nonce-locked with `strict-dynamic`. | — |
| R7 | `/api/health` is public and queries the database | P3 | Returns only up/down; frequent polling could keep a free database awake. | — |
| R8 | Mac launcher: runs `origin/main` on each start (curl \| bash), `npm install` rather than `npm ci`, log file may contain reset links if console mail is enabled, frees port 3000 | P3 | Designed for one non-technical owner of the repository; trust = repository write access. | Keep the GitHub account secured (2FA). |
| R9 | Recurring engine writes by rule id without user filter | P3 | System path; ids come from a user-scoped query, never from a client; composite FKs enforce ownership. | — |
| R10 | No currency conversion exists | — | By design until Q-2 is decided; nothing is ever added across currencies. | Q-2 |

## What was verified

- **Authorization:** every server action goes through `authedAction` (session first, then validation; client-supplied ids are stripped); every route handler uses `withUser` or a constant-time cron secret; every repository query and raw SQL statement is scoped by `user_id`; all child tables have composite foreign keys to the owner; all 23 app pages call `requirePageUser`. Cross-user tests exist for every module, reports, exports and settings.
- **Injection / XSS / redirects:** all raw SQL uses parameterized `Prisma.sql`; `Prisma.raw` only with constant operators; LIKE input escaped; no `dangerouslySetInnerHTML`; nonce CSP; CSV formula neutralization; safe callback URLs.
- **Sessions and secrets:** argon2id, JWT sessions verified against a database session version, generic auth errors, no secrets in the repository or history, production logs without messages or stacks.
- **Financial integrity:** the reconciliation test above (balances, transfers never change a currency's combined balance or income/spending, per-currency totals, month buckets, account history, budget spent, CSV), plus the existing per-module suites (month ends, leap years, timezones, idempotent recurring posting with concurrent workers, transfer atomicity in one row with CHECKs, decimal parsing in integer minor units).
- **UI:** axe-core WCAG 2.0/2.1/2.2 A/AA scan of every page on desktop, tablet and phone, overflow and title checks (Phase 10 audit), plus the full end-to-end suite.

## What was NOT verified

- A real deployment on Vercel and Neon (including Neon's role behaviour and pooled connections), backups and restore.
- Performance and load with large data sets (10,000+ records per user) and concurrent users.
- Browsers other than Chromium (Safari, Firefox), real phones, and a manual screen-reader pass.
- E-mail flows (no provider chosen), penetration testing by a third party, and dependency behaviour beyond `npm audit`.

## Test execution (final run, after all fixes)

| Suite | Result |
|---|---|
| Type check (`tsc`) and lint (ESLint, 0 warnings), format check | pass |
| Vitest unit + integration | **505 passed** (41 files) — includes 16 regression tests and 8 reconciliation tests |
| `npm run test:unit` on its own | 220 passed |
| Production build | pass |
| Playwright end-to-end (desktop, tablet, phone; incl. accessibility sweep) | **266 passed, 0 failed**, 7 skipped (layout-specific tests that only apply to one screen size) |

## Release recommendation

**Conditional go for personal and small private use** (your Mac, or a free Vercel + Neon deployment for you and your family), provided the deployment follows the updated `docs/DEPLOYMENT.md` (SQL-created database user, Production-only variables, `TRUSTED_IP_HEADER=x-real-ip`) and Prisma is upgraded per R1.

**No-go for a public, open-registration service** until: e-mail verification and recovery exist (Q-12), `next-auth` is on a stable release, load testing and an external security test have been done, and a backup/restore procedure is in place. Passing automated tests is evidence, not proof, that the system is secure.
