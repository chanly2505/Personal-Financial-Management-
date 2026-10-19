# Production audit

Phase 1 of the production-readiness audit (19 Oct 2026, commit `4afa2ad`). Inspection only: no application code was changed. Companion documents: [security-audit.md](security-audit.md), [financial-logic-audit.md](financial-logic-audit.md), [ux-audit.md](ux-audit.md).

**Correction to the brief:** the database is **Neon PostgreSQL** (project `personal-finance`, AWS US East 2), not Supabase. There is no Supabase client, no PostgREST/Data API and no Supabase service-role key. The questions about Row Level Security are answered for this setup in [security-audit.md](security-audit.md#sec-9-no-row-level-security-defence-in-depth-assessment).

## Overall assessment

The application is in good shape. Its core is sound: authentication, per-user isolation, exact money arithmetic, atomic writes and duplicate-submit protection are implemented consistently and backed by database constraints and tests. There are **no Critical findings**. The main risks are operational: how changes reach production, extra deployments that share the database, open registration with no password recovery, and how forms behave on a bad connection.

| Area | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|
| Production / operations (this file) | 0 | 1 | 5 | 4 | 3 |
| Security | 0 | 0 | 2 | 4 | 4 |
| Financial logic | 0 | 0 | 1 | 6 | 2 |
| UX / accessibility | 0 | 1 | 7 | 7 | 0 |

**Baseline actually run during this audit:** `npm run check` (typecheck, lint with 0 warnings, Prettier, 42 test files) passed, with **525/525 tests**. End-to-end tests were not re-run in this phase; the last recorded run is in docs/QA_REPORT.md.

## Inventory

### Stack

| Layer | Technology |
|---|---|
| Frontend and backend | Next.js 16.4.2 (App Router, server components, server actions, `src/proxy.ts`), React 19.2, TypeScript (strict) |
| UI | Tailwind CSS 4, Radix-based components in `src/components/ui`, Recharts 3, Sonner toasts, react-hook-form + zod |
| Authentication | Auth.js 5.0.0-beta.32. Credentials provider and a JWT cookie (7 days). Every request also checks a server-side `auth_sessions` row (the `sid` claim) and `users.session_version`. Passwords use argon2id (`@noble/hashes`, pure JS). |
| Database access | Prisma 7.10 with `@prisma/adapter-pg` (pg 8.23); 12 hand-reviewed SQL migrations |
| Database | Neon PostgreSQL 17. The app connects as the least-privilege role `finance_app`; migrations use the owner role. |
| Hosting | Railway (project `jubilant-unity`, region US East / `iad`), built by Railpack from GitHub `main`, `railway.json` |
| Tests | Vitest (unit and integration against a real Postgres), Playwright + axe (e2e), a release suite against a deployed URL |

### Code layout

- `src/app`: route groups `(app)` (signed-in pages), `(auth)`, `(dev)`, `api/`, plus `privacy`.
- `src/features/<module>/`: `actions.ts` (server actions), `schemas.ts` (zod), `components/`, `server/{service,repository}.ts`. The modules are accounts, auth, budgets, categories, dashboard, goals, recurring, reports, settings and transactions.
- `src/server`: env validation, db client, auth, logger, mail, health, scheduler.
- `src/lib`: money, dates, csv and other shared helpers.
- `prisma/`: schema, migrations, seed, SQL for the app role.
- `scripts/`: build, backup, verify-backup, Mac start-up. Also `tests/`, `e2e/`, `release/` and `docs/`.

### Routes

**Public pages:**
- `/` (sends signed-in users to `/dashboard`), `/privacy`, `/sign-in`, `/register`.
- `/forgot-password` and `/reset-password` return 404 while no mail provider is configured.
- `/design-system` returns 404 in production unless `ENABLE_DESIGN_SYSTEM_PAGE` is set.

**Signed-in pages** (enforced by `requirePageUser()` in `src/app/(app)/layout.tsx` and in every page; `src/proxy.ts` only adds an early redirect):
- `/dashboard`, `/categories`, `/reports`, `/settings`.
- `/transactions`, `/accounts`, `/recurring` and `/goals`, each with `/new`, `/[id]` and `/[id]/edit`.
- `/budgets`, `/budgets/new`, `/budgets/[id]/edit`.

**Route handlers:**

| Route | Methods | Protection |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | Auth.js (CSRF token) |
| `/api/health` | GET | Public. Returns only up/down and the commit. |
| `/api/me`, `/api/me/export`, `/api/transactions/export` | GET | `withUser` (401 when signed out) |
| `/api/cron/recurring` | GET, POST | `Authorization: Bearer CRON_SECRET`, constant-time compare. Off (503) when the secret is unset. |

**Server actions:** 49 across 9 files. All are wrapped in `authedAction` except the public auth actions (sign in, register, forgot and reset password, sign out) and `setThemeAction`, which only sets a theme cookie.

### Database (14 tables)

All primary keys are UUIDv7. Money is BIGINT in minor units. Every child table has `user_id` with `ON DELETE CASCADE`, and composite foreign keys that include `user_id` stop any row from pointing at another user's records.

| Table | Purpose | Key relationships and constraints |
|---|---|---|
| `users` | Account, preferences, `session_version` | Unique lower-cased email |
| `auth_sessions` | Server-side sessions (revocable) | → users |
| `auth_rate_limits` | HMAC-keyed counters | Key is 64 hex characters |
| `password_reset_tokens` | SHA-256 token hashes | Unique hash, → users |
| `accounts` | Bank, cash and wallet accounts in USD or KHR | Unique (user, name) |
| `categories` | Income or expense categories | Unique (user, type, name) |
| `transactions` | Income and expense entries | → account (user), → category (user, type), optional → recurring rule. Unique (user, client_request_id) and (rule, recurrence_date). Amount > 0. |
| `transfers` | One row per transfer (both sides) | → from/to account (user). Different accounts, equal amounts, one reversal per transfer. Unique (user, client_request_id). |
| `recurring_rules` / `recurring_runs` | Schedules and their run history | Unique (rule, occurrence date) |
| `budgets` / `budget_alerts` | Monthly expense-category limits and threshold alerts | Unique (user, category, month, currency). Expense categories only. |
| `savings_goals` / `savings_contributions` | Goals and money set aside | Unique (user, name) and (user, client_request_id) |

Full details: docs/DATABASE.md, `prisma/schema.prisma`, `prisma/migrations/`.

### Environment variables (names only)

**Set on Railway now:**
- `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `CRON_SECRET`, `RECURRING_SCHEDULER`, `TRUSTED_IP_HEADER`.
- Not used by the running app: `MIGRATION_DATABASE_URL`, `TEST_DATABASE_URL`, `E2E_DATABASE_URL` (see PROD-6).

**Validated in `src/server/env.ts`:**
- `DATABASE_URL`, `AUTH_SECRET`, `NODE_ENV`, `TRUSTED_IP_HEADER`, `MAIL_TRANSPORT`, `APP_URL`.
- `ENABLE_DESIGN_SYSTEM_PAGE`, `CRON_SECRET`, `RECURRING_SCHEDULER`, `REGISTRATION_LIMIT_WITHOUT_IP`.

**Read elsewhere:**
- Auth.js: `AUTH_URL`, `AUTH_TRUST_HOST`. Prisma CLI: `MIGRATION_DATABASE_URL`.
- Build metadata: `NEXT_PHASE`, `APP_COMMIT`, `VERCEL_GIT_COMMIT_SHA`, `COMMIT_REF`, `WORKERS_CI_COMMIT_SHA`.
- Cloudflare build only: `CF_BUILD`, `WORKERS_CI`, `WORKERS_CI_BRANCH`, `CF_RUN_MIGRATIONS`.
- Client (public identifiers, not secrets): `NEXT_PUBLIC_FIREBASE_*`.
- Seed: `SEED_DEMO_PASSWORD`. Backups: `BACKUP_DATABASE_URL`.
- Tests: `TEST_DATABASE_URL`, `E2E_DATABASE_URL`, `E2E_PORT`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, `RELEASE_URL`, `RELEASE_CRON_SECRET`.
- Provided by Railway: `PORT`.

No secrets are committed: only `.env.example` is tracked, and `.env*` files are git-ignored (checked with `git ls-files`).

### Tests

| Suite | Files | Covers |
|---|---|---|
| Unit (`tests/unit`) | 19 | Money parsing and formatting, dates, schemas, env, CSV quoting, password hashing, client IP, safe redirects, recurring schedule, period maths |
| Integration (`tests/integration`, real Postgres) | 23 | Every module's services and actions, authorization and cross-user isolation, reconciliation (balances = ledger = dashboard = reports = CSV), schema constraints, sessions, recurring idempotency and concurrency, audit regressions |
| Performance (`tests/perf`) | 1 | 10,000-record benchmark (p95 < 500 ms) |
| End-to-end (`e2e/`) | 14 specs | Every module on desktop, tablet and phone; axe accessibility sweeps in light and dark |
| Release (`release/`) | 1 | Against the deployed URL: sign-up, money flows, isolation, headers, scheduled job |

### Deployment

- **Railway:** `railway.json` starts with `npm start` (`next start`, which uses Railway's `PORT`; the logs show port 8080). Health check `/api/health`, 120 s timeout, restart on failure up to 5 times.
- **Build:** `scripts/build.sh` runs `next build`.
- **Health:** `/api/health` runs `SELECT 1` and returns 200 `{"status":"ok","database":"ok"}`, or 503 with no detail.
- **Scheduler:** recurring transactions are posted by an in-process hourly scheduler (`RECURRING_SCHEDULER=in-process`). It is safe with several instances, because rows are locked with `FOR UPDATE SKIP LOCKED` and posted items are unique.
- **Verified live today:** after `DATABASE_URL` was corrected, the deployment connected to Neon, the owner registered, and every page returned 200 (Railway HTTP logs).

## Findings

Severity scale: Critical (data loss or exposure now), High (likely serious harm or an open gap in production), Medium (real but limited, or needs a specific trigger), Low (minor), Info (note or confirmation).

### PROD-1: Other deployments may still serve the same production database
- **Severity:** High (needs the owner to confirm).
- **Evidence:**
  - docs/DEPLOYMENT.md records a live Cloudflare Workers deployment (`personal-financial-management.cly541913.workers.dev`) using the same Neon database.
  - `wrangler.jsonc` has `"workers_dev": true` and an hourly cron.
  - `scripts/build.sh` still hands over to the Cloudflare build when Workers Builds runs.
  - A Netlify site and Vercel attempts were created earlier.
  - The Cloudflare connector available here lists a different account, so I could not confirm whether that Worker still exists.
- **User impact:**
  - Your financial data is reachable through more than one public address. A forgotten deployment may run older code and keeps its own copy of the secrets.
  - Rate limits are counted separately per deployment if their `AUTH_SECRET`s differ (SEC-4).
- **Recommended fix:**
  1. Delete or disconnect the Cloudflare Worker and any Netlify or Vercel projects connected to this repository.
  2. Then rotate the database password and `AUTH_SECRET`; they were also shown in chat.
- **Acceptance criteria:**
  - Only the Railway address serves the app. The old addresses return an error or no longer exist.
  - The Neon role password and `AUTH_SECRET` are new, and only Railway has them.

### PROD-2: Deploys do not apply database migrations, and the health check cannot detect a missing migration
- **Severity:** Medium (no migration is pending today, so this is a process risk).
- **Evidence:**
  - `railway.json` has no `preDeployCommand`.
  - docs/DEPLOYMENT.md: "New migrations: run `npx prisma migrate deploy` with the owner URL … before deploying code that needs them".
  - `src/server/health.ts` only runs `SELECT 1`.
- **User impact:** If a future change adds a migration, Railway deploys the new code against the old schema. Pages fail while health still reports ok.
- **Recommended fix:** Choose one:
  - **(a) Railway runs migrations.** Add a Railway pre-deploy command `npx prisma migrate deploy` with `MIGRATION_DATABASE_URL` set as a Railway variable. Prisma CLI is a dev dependency, so confirm it is available at that stage.
  - **(b) Owner runs migrations by hand.** Keep the manual step, written as a checklist item before each release.
- **Acceptance criteria:**
  - With (a), a deploy containing a new migration applies it before the switchover, and a failed migration stops the deploy.
  - With (b), the checklist item exists and is followed.

### PROD-3: Nothing checks code before it goes live
- **Severity:** Medium.
- **Evidence:** There is no `.github/workflows`, and Railway deploys every push to `main`.
- **User impact:** A change that fails typecheck, lint or tests goes straight to production.
- **Recommended fix:**
  1. Add a GitHub Actions workflow that runs `npm run check` against a Postgres service container.
  2. Turn on Railway's "Wait for CI" option.
  3. Do changes on branches and merge to `main` only when they pass.
- **Acceptance criteria:** A failing check blocks the Railway deploy.

### PROD-4: Backups are manual
- **Severity:** Medium.
- **Evidence:**
  - `scripts/backup-db.sh` writes a `pg_dump` to `~/Documents/personal-finance-backups` on the computer that runs it.
  - docs/RELEASE_CHECKLIST.md D4 is "manual — pending deployment".
  - Neon's point-in-time restore is the only automatic layer, and its window depends on the plan.
- **User impact:** If data is damaged and the change is noticed after Neon's restore window, there may be no copy.
- **Recommended fix:**
  1. Run the existing backup script now, and record the restore test with `scripts/verify-backup.sh`.
  2. Then schedule it: a Railway cron service or a GitHub Action that writes an encrypted dump to storage, with retention.
  3. Check Neon's restore window for the current plan.
- **Acceptance criteria:**
  - At least one verified backup exists.
  - Automated daily dumps exist for the last 7 days, and a restore test is recorded monthly.

### PROD-5: The operations runbook and README still describe Vercel or Cloudflare
- **Severity:** Medium.
- **Evidence:**
  - docs/OPERATIONS.md:7 says "Production = **Vercel**", with Vercel rollback, logs and cron steps.
  - README.md:7 says "being deployed on **Cloudflare Workers + Neon**"; README.md:24 says "production setup on Vercel + Neon".
  - `release/release.spec.ts` mentions "Vercel → Settings → Cron Jobs".
  - Only docs/DEPLOYMENT.md is up to date.
- **User impact:** During an incident, the runbook points at the wrong platform for rollback, logs and variables.
- **Recommended fix:** Rewrite OPERATIONS.md and the README for Railway: rollback via Deployments → Redeploy, logs, variables, the in-process scheduler. Move the other hosts into an "alternatives" appendix.
- **Acceptance criteria:** `grep -i vercel README.md docs/OPERATIONS.md` matches only the alternatives section.

### PROD-6: Unused database settings on Railway
- **Severity:** Medium.
- **Evidence:** Railway holds `MIGRATION_DATABASE_URL`, `TEST_DATABASE_URL` and `E2E_DATABASE_URL`. The running app reads none of them, and the build never runs migrations because `scripts/build.sh` only does so in the Cloudflare branch. The values were not read in this audit.
- **User impact:** One of them may hold the owner (schema-changing) password, which widens what a Railway compromise exposes. The test URLs may point to local databases and confuse anyone reading the settings.
- **Recommended fix:** Delete the two test variables. Keep `MIGRATION_DATABASE_URL` only if option (a) of PROD-2 is chosen.
- **Acceptance criteria:** Railway variables contain only what the running app (and, if chosen, the migration step) uses.

### PROD-7: No password recovery in production, and no documented manual reset
- **Severity:** Medium.
- **Evidence:**
  - `src/server/env.ts` sets `MAIL_TRANSPORT` to `none` by default; `src/server/mail.ts` refuses to send.
  - The forgot-password pages return 404, and the link is hidden (`src/features/auth/components/sign-in-form.tsx:55`).
  - docs/OPERATIONS.md has no procedure for an owner-run reset.
- **User impact:** A user who forgets their password is locked out with no guidance. See also UX-4 and SEC-2.
- **Recommended fix:**
  - Short term: write an owner-run reset script and document it.
  - Long term: choose an email provider (PRD Q-12) and add a transport.
- **Acceptance criteria:** Either a reset email works end to end on Railway, or a documented and tested manual reset exists.

### PROD-8: `/api/health` reports `"version": "local"` on Railway
- **Severity:** Low.
- **Evidence:** `next.config.ts:28-33` reads only `VERCEL_GIT_COMMIT_SHA`, `COMMIT_REF` and `WORKERS_CI_COMMIT_SHA`. Railway provides `RAILWAY_GIT_COMMIT_SHA`.
- **User impact:** You cannot confirm from outside which commit is live.
- **Recommended fix:** Add `process.env.RAILWAY_GIT_COMMIT_SHA` to that list.
- **Acceptance criteria:** `/api/health` on Railway shows the 7-character commit of the deployment.

### PROD-9: Leftover configuration for other hosts adds weight and confusion
- **Severity:** Low.
- **Evidence:**
  - `@opennextjs/cloudflare` is a runtime dependency, imported by `src/server/db.ts:2`.
  - `wrangler` and `workerd` are installed on every Railway build.
  - Also present: `vercel.json`, `netlify.toml`, `netlify/`, `cloudflare/`, `open-next.config.ts`, the `vercel-build`, `netlify-build` and `cf:*` scripts, and a `CF_BUILD` block in `next.config.ts`.
  - The Workers branch in `db.ts` never runs on Node (`navigator.userAgent` is `Node.js/…`), so it is safe, just unused.
- **User impact:**
  - Slower builds and more transitive dependencies; the npm audit glob advisory (QA_REPORT R12) comes from this path.
  - Next.js upgrades stay tied to the Cloudflare adapter.
- **Recommended fix:** Once Railway is confirmed as the long-term host, remove these files, scripts and dependencies, and the Workers branch in `db.ts`. Alternatively, move them to a branch.
- **Acceptance criteria:** `npm ls @opennextjs/cloudflare wrangler` is empty, and the build, tests and the Railway deploy pass.

### PROD-10: Unused Firebase SDK in every page; Node version not pinned
- **Severity:** Low.
- **Evidence:**
  - `@firebase/app` 0.16.3 is a dependency. `src/components/providers/firebase-init.tsx` only calls `initializeApp`, and no Firebase service is used.
  - The CSP `connect-src 'self'` would block Firebase network calls anyway.
  - Its package requires Node ≥ 24.12, which causes the `EBADENGINE` warning in the Railway build log, while `package.json` allows `>=22.12`. Railway chose Node 22.23.
- **User impact:** The browser downloads extra JavaScript for nothing. The runtime Node major version can change without anyone deciding to.
- **Recommended fix:**
  - Firebase: remove it, unless you plan to use it (then also update the CSP).
  - Node: pin `"engines": {"node": "22.x"}` and add `.nvmrc`.
- **Acceptance criteria:** No `EBADENGINE` line in the Railway build log, and the Node version is pinned deliberately.

### PROD-11: The scheduler needs an always-on instance; deploys cut in-flight requests
- **Severity:** Low.
- **Evidence:**
  - `src/server/recurring-scheduler.ts` uses `setTimeout` and `setInterval` in the server process.
  - Next.js exits on SIGTERM without draining requests.
- **User impact:**
  - If Railway "App Sleeping" is turned on, or the service stays down after 5 failed restarts, recurring transactions stop until it runs again. Missed ones are caught up later.
  - A request in progress during a deploy can fail. Data stays consistent because transactions roll back.
- **Recommended fix:**
  - Keep App Sleeping off.
  - Optionally add an alert when no `recurring.run_finished` log appears for 2 hours, or use a Railway cron service that calls `/api/cron/recurring`.
- **Acceptance criteria:** The scheduler's continued operation is monitored, or the scheduler no longer depends on the web process.

### PROD-12: Build-log warnings (Info)
- **Severity:** Info.
- **Evidence:** "npm warn config production Use `--omit=dev`" in the Railway logs.
- **User impact:** None. Railpack sets a deprecated npm option. The build needs dev dependencies (`prisma generate`, Tailwind, TypeScript), and gets them.
- **Recommended fix:** None.
- **Acceptance criteria:** Not applicable.

### PROD-13: Code hygiene (Info)
- **Severity:** Info.
- **Evidence:**
  - No `TODO`, `FIXME`, `XXX` or `HACK` comments in the source.
  - `src/lib/action-result.ts` and `src/server/action-result.ts` are a deliberate split between client types and server helpers, not duplication.
  - The three scheduler wrappers (Cloudflare, Netlify, in-process) duplicate each other; this resolves with PROD-9.
  - `@types/node` is ^20 while the runtime is Node 22.
- **User impact:** None.
- **Recommended fix:** Align `@types/node` with the runtime when PROD-10 is done.
- **Acceptance criteria:** Not applicable.

### PROD-14: Developer page and Vercel-only setting in production builds (Info)
- **Severity:** Info.
- **Evidence:**
  - `/design-system` is gated per request (`src/app/(dev)/design-system/page.tsx:42`).
  - The cron route sets `maxDuration = 60`, which only Vercel reads.
- **User impact:** None. The page shows no user data and returns 404 in production.
- **Recommended fix:** Keep `ENABLE_DESIGN_SYSTEM_PAGE` unset on Railway.
- **Acceptance criteria:** `/design-system` returns 404 on Railway.

## Prioritised plan (for approval)

**P0: Critical security or financial-integrity defects.** None found.

**P1: Important defects and production gaps:**
1. PROD-1 / SEC-4: shut down the extra deployments, then rotate secrets. These are owner actions; I can guide or use connectors.
2. UX-1: forms give no message, or stay stuck, when the connection fails.
3. FIN-1: double-submitting a new recurring rule can create two rules, so every occurrence is posted twice.
4. SEC-2 + PROD-7 + UX-4: decide on registration (open, allowlist or closed) and provide a password-reset path.
5. SEC-5: invalid ids in page URLs show an error page (500) instead of "not found".
6. PROD-2 + PROD-3: a migration step and a CI gate before deploys.
7. PROD-4: first verified backup, then scheduled backups.
8. SEC-1: test whether Railway's `X-Real-IP` can be spoofed, and add global (non-IP) limits.

**P2: UX, accessibility and maintainability:**
- UX-2, UX-3, UX-5 to UX-11.
- FIN-2 (wrong "−0.0%" sign), FIN-3, FIN-4, FIN-8.
- SEC-3, SEC-6.
- PROD-5, PROD-6, PROD-8, PROD-10, PROD-11.

**P3: Optional:**
- PROD-9 (remove the other hosts' code), FIN-5 (doc drift), FIN-6, FIN-7, FIN-9.
- UX-12 to UX-15.
- SEC-7, SEC-11.
- Prisma 7.10.1 upgrade on or after 29 Oct 2026 (SEC-10).
