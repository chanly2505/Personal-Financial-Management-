# Personal Finance

Track income, expenses, transfers, accounts, budgets, recurring items, savings goals and reports in USD and KHR.

Built with Next.js 16.4, TypeScript, Tailwind CSS 4, shadcn/ui, PostgreSQL (16 locally, 17 on Neon) and Prisma 7.

**Status:** every module is built, audited and hardened (Phases 0–11 and 13: [docs/QA_REPORT.md](docs/QA_REPORT.md), [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)) and being deployed on **Cloudflare Workers + Neon** ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)). Phase 12 (production deployment) is prepared; the deployed address is added here only after the release checks pass against it.

## Contents

[Documentation](#documentation) · [Local installation](#local-installation) · [Environment variables](#environment-variables) · [Database setup and migrations](#database-setup-and-migrations) · [Tests](#tests) · [Build](#build) · [Deployment](#deployment) · [Backup and recovery](#backup-and-recovery) · [Known limitations](#known-limitations) · [Troubleshooting](#troubleshooting) · [Easiest way on a Mac](#easiest-way-on-a-mac)

## Documentation

| Document | Contents |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Requirements, financial rules, open decisions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, layers, modules, directory layout, ADRs |
| [docs/DATABASE.md](docs/DATABASE.md) | Entities, money and dates, constraints, migrations |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, auth, authorization, headers, logging |
| [docs/UI_GUIDELINES.md](docs/UI_GUIDELINES.md) | Design tokens, layouts, components, accessibility |
| [docs/REPORTS.md](docs/REPORTS.md) | Report definitions and CSV export format and limits |
| [docs/I18N.md](docs/I18N.md) | Text catalog and how to add Khmer |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Step-by-step production setup on Vercel + Neon |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Production runbook: migrations, backups, recovery, rollback, outages, scheduler |
| [docs/QA_REPORT.md](docs/QA_REPORT.md) | Phase 11 audit and Phase 13 security review: findings, fixes, accepted risks, release recommendation |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | What to verify before and after each release (automated and manual) |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phases, exit criteria, known issues |
| [CLAUDE.md](CLAUDE.md) | Commands and coding rules |

## Local installation

Requirements: **Node.js 22.12+**, **PostgreSQL 16+**. (On a Mac, the one-line launcher below does all of this for you.)

```bash
git clone https://github.com/chanly2505/Personal-Financial-Management-.git personal-finance
cd personal-finance
cp .env.example .env
openssl rand -base64 32        # paste into AUTH_SECRET in .env
npm install                    # also generates the Prisma client
npm run db:migrate             # create the tables in the dev database
npm run db:seed                # optional demo user and data
npm run dev                    # http://localhost:3000
curl localhost:3000/api/health # {"status":"ok","database":"ok","version":"local"}
```

Open `/register` to create an account, or sign in as the seeded demo user. `/design-system` shows every UI component (development only).

## Environment variables

`.env.example` documents every variable; the app validates them at start-up (`src/server/env.ts`) and names any that are missing or invalid. `.env` is git-ignored — never commit real values.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Runtime connection — the least-privilege app role (`finance_app`); pooled on Neon |
| `MIGRATION_DATABASE_URL` | for migrations | Schema owner, used only by `prisma migrate` (direct, non-pooled on Neon) |
| `AUTH_SECRET` | yes | 32+ random bytes; encrypts session cookies; unique per environment |
| `AUTH_URL` | locally with `npm start`; recommended in production | The address users open (`https://…`). On Vercel the host is trusted automatically |
| `TRUSTED_IP_HEADER` | production | Header carrying the client IP for rate limits (`x-real-ip` on Vercel) |
| `CRON_SECRET` | if the cron endpoint is used | 32+ characters; protects `/api/cron/recurring` |
| `RECURRING_SCHEDULER` | no | `in-process` runs recurring posting inside the server (single machine, e.g. a Mac); default `off` |
| `REGISTRATION_LIMIT_WITHOUT_IP` | no | Shared sign-up limit per hour while the client IP is unknown (default 30) |
| `MAIL_TRANSPORT`, `APP_URL` | no | Password recovery e-mail; `none` until a provider is chosen (Q-12) |
| `NEXT_PUBLIC_FIREBASE_*` | no | Public Firebase web config (no Analytics); built into browser code |
| `ENABLE_DESIGN_SYSTEM_PAGE` | no | Exposes `/design-system` in production builds (tests only) |
| `TEST_DATABASE_URL`, `E2E_DATABASE_URL` | tests | Databases for integration and end-to-end tests (names must end in `_test` / `_e2e`) |
| `SEED_DEMO_PASSWORD` | no | Password for the seeded demo user |

## Database setup and migrations

Create the local databases and the least-privilege role (local only — use strong credentials anywhere else):

```bash
# As the postgres superuser (e.g. prefix with: sudo -u postgres)
createuser -P --createdb finance        # schema owner; password: finance
createdb -O finance finance_dev
createdb -O finance finance_test
createdb -O finance finance_e2e
psql -d finance_dev -v app_role=finance_app -v app_password='change-me' \
     -v owner_role=finance -f prisma/sql/app-role.sql
```

| Command | What it does |
|---|---|
| `npm run db:migrate -- --name <change>` | Create and apply a migration in development |
| `npm run db:deploy` | Apply pending migrations (production uses this, automatically on Vercel via `vercel-build`) |
| `npm run db:status` | Show applied/pending migrations |
| `npm run setup` | `npm install` + generate client + apply migrations (run after every `git pull`) |
| `npm run db:seed` | Demo data (refuses to run against production or non-dev databases) |
| `npm run db:reset` | Drop and re-create the **dev** database (destructive; never on production) |

Migrations are hand-reviewed SQL in `prisma/migrations/` and are additive (expand-only), so the previous app version keeps working on the new schema — see [docs/DATABASE.md](docs/DATABASE.md).

## Tests

```bash
npm run check          # typecheck + lint + format check + unit & integration tests (513)
npm run test:unit      # unit tests only
npm run test:e2e       # Playwright: desktop, tablet and phone against a local production build (incl. accessibility sweep)
npm run test:perf      # performance benchmark: 10,000 records, p50/p95 per page (uses the test database)
RELEASE_URL=https://your-site.vercel.app npm run release:check   # release checks against a deployed site
```

Integration tests run against `TEST_DATABASE_URL`; end-to-end tests build the app and run it against `E2E_DATABASE_URL`. Release checks use a throwaway account with made-up data and delete it afterwards (add `RELEASE_CRON_SECRET=…` to also check the scheduled job). If Chromium is preinstalled, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

## Build

```bash
npm run build && npm start     # production build and server (set AUTH_URL to the address you open)
```

## Deployment

**Hosting:** Railway + Neon (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#railway--neon-current)); Cloudflare Workers remains a documented alternative. **Current target: Cloudflare Workers + Neon** (Workers Paid plan; `wrangler.jsonc`, `npm run cf:build`, hourly cron trigger). Settings and steps: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Alternative — Vercel Hobby in `cle1` (Cleveland) next to Neon PostgreSQL in AWS US East 2 (Ohio); free tiers, HTTPS by default. In short:

1. Neon project in AWS US East 2 (Ohio); create the limited `finance_app` role with `prisma/sql/app-role-neon.sql`.
2. Vercel project from this GitHub repository; set `DATABASE_URL` (app role, pooled), `MIGRATION_DATABASE_URL` (owner, direct), `AUTH_SECRET`, `CRON_SECRET`, `TRUSTED_IP_HEADER=x-real-ip` — **Production environment only**.
3. Deploy. `vercel-build` applies migrations, then builds; a failed migration fails the deploy and the previous version stays live.
4. Verify: `/api/health`, then `npm run release:check` against the address.
5. Every push to `main` deploys again; the recurring job runs daily from `vercel.json`.

## Backup and recovery

Summary (full runbook in [docs/OPERATIONS.md](docs/OPERATIONS.md)):

- **Point-in-time restore** — Neon keeps a restore window (hours on the free plan; longer on paid plans). Restore into a *new branch*, check it, then switch `DATABASE_URL` — never overwrite production blindly.
- **Logical backups** — weekly: `BACKUP_DATABASE_URL=<owner direct URL> scripts/backup-db.sh` (read-only `pg_dump`; file written owner-only outside the repo).
- **Recovery test** — monthly: `scripts/verify-backup.sh <file.dump>` restores into a temporary local database, checks counts and integrity, and drops it.
- **Users' own copies** — Settings → Your data (CSV and full JSON).
- **App rollback** — Vercel → Deployments → previous deployment → *Instant Rollback* (safe because migrations are additive).

## Known limitations

- Single currency per account; no currency conversion anywhere (Q-2). Cross-currency transfers not supported.
- No e-mail: password reset and e-mail changes are unavailable until a provider is chosen (Q-12).
- Recurring transactions post once a day on Vercel Hobby (hourly needs a paid plan or another scheduler).
- English only (structure ready for Khmer, docs/I18N.md). No CSV import.
- Free tiers: Neon 0.5 GB and sleeps when idle (first request after a pause is slower); Vercel Hobby is for personal, non-commercial use; short log retention.
- Accepted risks from the audit (Prisma CLI upgrade due on/after 29 Oct 2026, `next-auth` beta, etc.): [docs/QA_REPORT.md](docs/QA_REPORT.md#accepted-risks-and-known-limitations-not-fixed).

## Troubleshooting

**Local**

- **Can't sign in / "Something went wrong" after signing in** — the database is missing migrations: `npm run setup`, restart.
- **Accounts are created but sign-in returns to the sign-in page** (`npm start`) — set `AUTH_URL` to the address you open and rebuild (`"errorType":"UntrustedHost"` in the log).
- **`Invalid environment configuration`** — a variable is missing or malformed; the message names it.
- **`Can't reach database server`** — start PostgreSQL (`brew services start postgresql`, or `service postgresql start` in containers).
- **`permission denied for schema public`** during migrations — set `MIGRATION_DATABASE_URL` to the owner role.
- **`npm install` fails with `edgesOut`** — npm 10 bug; run `npx npm@11 install`.

**Production** (details in [docs/OPERATIONS.md](docs/OPERATIONS.md))

- **`/api/health` returns 503 `unreachable`** — database outage or wrong `DATABASE_URL`: check Neon's status and the project's compute; see "Database outage".
- **Deploy failed at `prisma migrate deploy`** — the previous version is still live; see "Failed migration".
- **Everyone gets "Too many attempts"** — `TRUSTED_IP_HEADER` missing (the log shows `security.ip_rate_limits_disabled`).
- **Recurring items not posting** — Vercel → Settings → Cron Jobs: last run and status; `CRON_SECRET` set in Production; Recurring page shows paused rules and reasons.
- **Signed out unexpectedly** — sessions last 7 days and end on password change or "Sign out everywhere".

## Easiest way on a Mac

Paste this into Terminal. It finds (or downloads) the project, updates it, starts PostgreSQL if Homebrew manages it, installs packages, applies migrations, starts the app on this Mac only, and opens it:

```bash
curl -fsSL https://raw.githubusercontent.com/chanly2505/Personal-Financial-Management-/main/scripts/start-mac.sh | bash -s -- ~/Desktop/personal-finance
```

Afterwards double-click **Start Personal Finance.command** in the project folder. Keep the Terminal window open while you use the app. Local edits are never deleted — they are saved with `git stash`.
