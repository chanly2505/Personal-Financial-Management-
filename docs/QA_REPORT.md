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
| R11 | `braces@3.0.3` (via `eslint-config-next` → `fast-glob` → `micromatch`): stack-exhaustion advisory GHSA-vfj7-8cjw-p6xm, 7 high in full `npm audit` (found Phase 13) | P3 | Development-only lint tool; it only expands the project's own file patterns; not in the app or the production install. No fixed version exists (3.0.3 is the latest; npm's suggested fix is a downgrade to Next 14's config). | Upgrade when `braces` or `eslint-config-next` publishes a fix. |
| R12 | `glob@10.3.3` via `@opennextjs/cloudflare` → `@opennextjs/aws` → `@node-minify/core`: GHSA-5j98-mcp5-4vw2, command injection in the glob **CLI** `-c/--cmd` option (3 high entries in `npm audit --omit=dev`, Oct 2026) | P3 | Build-time dependency of the Cloudflare adapter; the glob CLI is never run and none of it is in the Worker. npm's suggested fix downgrades the adapter to a version without Next.js 16.4 support. | Upgrade `@opennextjs/cloudflare` when it moves off `@node-minify/core` 9 / glob 10.3. |

## What was verified

- **Authorization:** every server action goes through `authedAction` (session first, then validation; client-supplied ids are stripped); every route handler uses `withUser` or a constant-time cron secret; every repository query and raw SQL statement is scoped by `user_id`; all child tables have composite foreign keys to the owner; all 23 app pages call `requirePageUser`. Cross-user tests exist for every module, reports, exports and settings.
- **Injection / XSS / redirects:** all raw SQL uses parameterized `Prisma.sql`; `Prisma.raw` only with constant operators; LIKE input escaped; no `dangerouslySetInnerHTML`; nonce CSP; CSV formula neutralization; safe callback URLs.
- **Sessions and secrets:** argon2id, JWT sessions verified against a database session version, generic auth errors, no secrets in the repository or history, production logs without messages or stacks.
- **Financial integrity:** the reconciliation test above (balances, transfers never change a currency's combined balance or income/spending, per-currency totals, month buckets, account history, budget spent, CSV), plus the existing per-module suites (month ends, leap years, timezones, idempotent recurring posting with concurrent workers, transfer atomicity in one row with CHECKs, decimal parsing in integer minor units).
- **UI:** axe-core WCAG 2.0/2.1/2.2 A/AA scan of every page on desktop, tablet and phone, overflow and title checks (Phase 10 audit), plus the full end-to-end suite.

## What was NOT verified

- A real deployment on Vercel and Neon (including Neon's role behaviour and pooled connections), backups and restore.
- Load with many concurrent users (single-user performance with 10,000 records was measured in Phase 13).
- Browsers other than Chromium (Safari, Firefox), real phones, and a manual screen-reader pass (docs/RELEASE_CHECKLIST.md M1–M3).
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

## Phase 13 — hardening and security review

An independent reviewer went through docs/SECURITY.md section by section against OWASP ASVS 4.0 level 2. Every finding below was checked against the code before it was fixed.

### SR-1 · P2 · Signing out did not end the session on the server, and a copied cookie could be kept alive — fixed

- **Sign-out:** signing out only cleared the cookie in the browser. A copy of it (a shared computer, a stolen cookie) stayed valid for 7 days.
- **Refresh:** Auth.js re-signs JWT cookies with a fresh 7-day expiry whenever `/api/auth/session` is called (verified in `@auth/core/lib/actions/session.js`). Someone holding a copy could therefore keep it alive indefinitely.
- **Fix:** new `auth_sessions` table (additive migration `20261017150000_auth_sessions`).
  - Each sign-in creates a row, and the cookie carries its id (`sid`).
  - Every request requires the row to exist, belong to the user and be unexpired. The expiry is absolute: 7 days from sign-in.
  - Sign-out deletes that row, so other devices stay signed in.
  - Expired rows are pruned by the scheduled jobs.
  - Cookies issued before this change are refused, so everyone signs in once more.
- **Regression tests:**
  - `session.test.ts` "server-side sessions": sign-out of one device, absolute expiry, cross-user ids, pruning, cascade.
  - e2e `auth.spec.ts` "signing out ends the session on the server": a copied cookie is refused after sign-out, while another device stays signed in.

### SR-2 · P3 · Rate-limit keys were plain SHA-256 — fixed

- **Problem:** `sha256("scope:ip")` can be reversed by hashing all 2³² IPv4 addresses, so a database dump would reveal addresses.
- **Fix:** keys are now HMAC-SHA-256 with a key derived from `AUTH_SECRET`.
- **Regression test:** `audit-regressions.test.ts` "F3".

### SR-3 · P3 · The privacy notice overstated or missed facts — fixed

- **Rate-limit retention:** the notice said one hour; it is about two days, because rows are pruned daily 24 h after their window ends.
- **Cookies:** the short-lived Auth.js security cookies were missing.
- **Logs:** hosting access logs (URLs can contain search filters) were not mentioned.
- **Backups:** no retention period was stated (it is up to 12 months, per OPERATIONS.md).

### SR-4 · P3 · Documentation drift — fixed

- SECURITY.md §7 now says the health endpoint reports the deployed commit id.
- §10 backups now match OPERATIONS.md (weekly dumps, 8 weekly plus 12 monthly; Neon point-in-time restore).
- §2 now describes server-side sessions instead of "re-issued daily".

### Also found in Phase 13 (accessibility)

- **A-1 · P2 · Cards shared one HTML id — fixed.** Several dashboard and report cards got the same id from `React.useId()` in separately rendered server components, so their accessible names pointed at the first card's title. Cards are now named with `aria-label`. The audit sweep now fails on any duplicate id.
- **A-3 · P3 · New dark mode could undo itself — fixed before release.**
  - **Problem:** switching from Dark to "Same as this device" on a dark-preferring device saves a cookie, and the server re-render then rewrote the page classes and removed `dark`.
  - **How found:** the full e2e run (tablet).
  - **Fix:** the class is now set only by the theme script, never rendered by React.
  - **Regression test:** `settings.spec.ts` theme test ("Dark → System on a dark device"), passed 30 times in repeated runs.
- **A-2 · P3 · Logo outside landmarks — fixed.** On the sign-in, registration and privacy pages the logo link was outside any landmark; it is now in a `<header>`.

### Reviewed and found OK

- **Authorization:** every server action and route handler takes the user from the verified session (the theme action is deliberately public and only sets a validated cookie), every repository query is scoped by `user_id`, and nothing uses unsafe raw SQL.
- **Input and output:** CSV and JSON exports are safe.
- **CSRF and cron:** server actions use the Origin check; the cron secret is compared in constant time.
- **Headers:** the nonce CSP also covers the new theme script.
- **Secrets and logs:** env validation in place; the app's logs contain ids only.
- **Data deletion:** account deletion cascades to every table, including sessions.

### Performance (PRD §7)

`npm run test:perf` ran on local PostgreSQL 16 with 10,000 records plus 1,500 transfers for one user, and 30,000 records in the database overall. Each page was measured 40 times after warm-up.

| Page data | p50 | p95 |
|---|---|---|
| Dashboard, this month | 11.0 ms | 14.8 ms |
| Dashboard, this year | 13.9 ms | 18.7 ms |
| Transactions, first page / search / page 40 | 26–44 ms | 42–49 ms |
| Accounts / budgets | 3–4 ms | 4–8 ms |
| Reports: summary of last year / 3-year cash flow | 18–39 ms | 23–53 ms |
| CSV export, 11,500 rows (1 MiB) | — | 282 ms in total |

These times cover server data loading only, not React rendering or the network. On Neon, add the database round trips (same region). The plans show index scans on `transactions_user_date_covering_idx` and no sequential scans of transactions.

### Test execution (Phase 13, final run)

| Suite | Result |
|---|---|
| Type check, lint (0 warnings), format check | pass |
| Vitest unit + integration | **513 passed** (41 files; 8 new regression tests) |
| Performance benchmark (`npm run test:perf`) | 4 passed; every page < 500 ms p95 (table above) |
| Production build | pass |
| Playwright end-to-end (desktop, tablet, phone; light and dark accessibility sweeps, empty-account sweep, duplicate-id check) | **307 passed, 0 failed**, 11 skipped (tests that apply to one screen size only) |
| Release checks against a local production build | 4 passed; no test accounts left |

The release recommendation above still applies. The Phase 13 fixes remove SR-1 from the list of reasons for caution. The manual items in docs/RELEASE_CHECKLIST.md (screen reader, Safari and Firefox, real phone, live-site checks) are still to be done.

## Cloudflare Workers adaptation (18 Oct 2026)

On the owner's request the app was adapted to run on Cloudflare Workers as well as Node.js, without changing features.

| Change | Why | Evidence |
|---|---|---|
| Next.js 16.3.8 → 16.4.2 | `@opennextjs/cloudflare` 1.20.12 requires Next ≥ 16.4.1 (released 14–15 Oct; adopted earlier than the usual two-week wait, at the owner's request) | all suites below |
| Password hashing: `@node-rs/argon2` (native) → `@noble/hashes` argon2id (pure JS) | Workers cannot load native addons or compile WebAssembly at runtime | `tests/unit/password.test.ts`: hashes made by the old library still verify; same PHC format and parameters. ~0.2–0.4 s per hash (was ~0.04 s), so Workers needs the Paid plan. |
| One Prisma client per request on Workers, closed when the response has been sent (`src/server/db.ts`, `cloudflare/worker.ts`) | Workers cannot share a database connection between requests | e2e and release checks on workerd |
| Prisma client generated for `workerd` in Cloudflare builds; Prisma CLI/dev engines and `instrumentation.ts` kept out of the Worker (`scripts/cloudflare-build.sh`, `CF_BUILD` tracing excludes) | WebAssembly must be imported as a module; upload size limit | dry-run upload 5.4 MB gzip (was 20.6 MB) |
| Hourly cron trigger → `/api/cron/recurring` | scheduler on Workers | scheduled handler run 5×, all 200 |
| `prisma.config.ts` no longer requires a database URL for `prisma generate` | the first Cloudflare build failed during `npm install` | generate without variables succeeds; migrate still refuses without a URL |
| `next build` accepts missing `DATABASE_URL`/`AUTH_SECRET` during the build phase only (inert placeholders; `NEXT_PHASE=phase-production-build`) | the second Cloudflare build failed while collecting page data: build servers only get build variables | `tests/unit/env.test.ts` "build time"; clean install + `npm run build` and `npm run cf:build` with no variables succeed; runtime still refuses without them |
| Test fix: `recurring-failures.test.ts` stripped ids before checking that amounts never reach logs | a random id containing "300" made it fail intermittently | test passes repeatedly |

**Verified on the workerd runtime** (`npm run cf:build`, `wrangler dev`, local PostgreSQL): release checks 4/4 (no test accounts left), the desktop end-to-end suite 104 passed / 0 failed (run with one worker: a single local workerd process serialises CPU-heavy password hashing), scheduled handler 5/5.

**Known, not fixed:** in long local runs `pg`'s Cloudflare socket occasionally logs "Network connection lost" or "Broken pipe" when a connection is torn down (≈ 1 in 2,000 requests; no request failed). It comes from `pg-cloudflare`; supplying our own socket is not possible because Next.js bundles app code for Node.js.

**Not verified here:** an actual deployment to Cloudflare (the account, plan and secrets are the owner's), Smart Placement latency, and behaviour under concurrent production traffic.
