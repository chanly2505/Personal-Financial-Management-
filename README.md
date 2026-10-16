# Personal Finance

Track income, expenses, transfers, accounts, budgets, recurring items, savings goals and reports in USD and KHR.

Built with Next.js 16, TypeScript, Tailwind CSS 4, shadcn/ui, PostgreSQL 16 and Prisma 7.

**Status:** Phase 6 complete — authentication, profile settings, **accounts**, **categories**, **transactions** (income, expenses, same-currency transfers with reversal; searchable ledger) the **dashboard** (period filter, per-currency income/expenses/net/savings rate, balances, charts with table views) and **budgets** (monthly category limits, live usage, in-app warnings). Remaining modules are placeholders marked "Not available yet" until their phase — see [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Documentation

| Document | Contents |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Requirements, financial rules, open decisions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, layers, modules, directory layout, ADRs |
| [docs/DATABASE.md](docs/DATABASE.md) | Entities, money and dates, constraints, migrations |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, auth, authorization, headers, logging |
| [docs/UI_GUIDELINES.md](docs/UI_GUIDELINES.md) | Design tokens, layouts, component catalogue, accessibility |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phase order, tasks, exit criteria, known issues |
| [CLAUDE.md](CLAUDE.md) | Commands and coding rules |

## Setup

Requirements: **Node.js 22.12+**, **PostgreSQL 16**.

### 1. Create the databases and roles

Local development only — use strong, unique credentials anywhere else.

```bash
# As the postgres superuser (e.g. prefix with: sudo -u postgres)
createuser -P --createdb finance        # schema owner; password: finance
createdb -O finance finance_dev
createdb -O finance finance_test        # integration tests — name must end in _test
createdb -O finance finance_e2e         # Playwright — name must end in _e2e

# Least-privilege runtime role for the app (can read/write rows, cannot change the schema)
psql -d finance_dev -v app_role=finance_app -v app_password='change-me' \
     -v owner_role=finance -f prisma/sql/app-role.sql
```

The app connects as `finance_app`; migrations run as `finance`. See [docs/SECURITY.md §8](docs/SECURITY.md#least-privilege-database-access-implemented-phase-2). To skip the separate role locally, point `DATABASE_URL` at the owner role and leave `MIGRATION_DATABASE_URL` unset.

### 2. Configure the environment

```bash
cp .env.example .env
openssl rand -base64 32                 # paste into AUTH_SECRET in .env
```

Then set the `finance_app` password in `DATABASE_URL`. Keep `AUTH_URL` equal to the address you open in the browser (default `http://localhost:3000`); if it is missing when running `npm run build && npm start`, accounts are created but signing in fails (the server logs `"errorType":"UntrustedHost"`). `.env` is git-ignored; never commit real credentials. The app validates its environment at startup and names any missing or invalid variable.

Optional, to try password recovery locally (links are printed to the terminal, nothing is emailed):

```bash
cat > .env.development <<'ENV'
MAIL_TRANSPORT="console"
APP_URL="http://localhost:3000"
ENV
```

`.env.development` is read by `npm run dev` only, so production builds are unaffected.

### 3. Install, migrate, seed

```bash
npm install          # also generates the Prisma client (postinstall)
npm run db:migrate   # apply migrations to the dev database (as the owner role)
npm run db:seed      # optional demo user and data (see below)
```

### 4. Run

```bash
npm run dev          # http://localhost:3000
curl localhost:3000/api/health   # {"status":"ok","database":"ok"}
```

Open `/register` to create an account, or sign in as the seeded demo user. `/design-system` shows every UI component (development only).

## Authentication

- **Email + password** with Auth.js (Credentials provider, encrypted JWT session cookie, 7-day lifetime). Passwords are hashed with argon2id.
- **Protected pages:** everything under the app shell requires a session; signed-out visitors are sent to `/sign-in` and returned afterwards.
- **Settings → Password / Sessions:** changing the password or choosing "Sign out everywhere" ends every session on every device immediately.
- **Password recovery** is available when `MAIL_TRANSPORT` is configured. Production has no email provider yet (docs/PRD.md Q-12), so recovery is hidden there.
- **Rate limits** protect sign-in, registration and recovery. In production set `TRUSTED_IP_HEADER` to the header your host uses for the client IP, and `AUTH_URL` to the https origin (enables Secure cookies).

Details, limits and test coverage: [docs/SECURITY.md](docs/SECURITY.md).

### Production checklist

| Variable | Value |
|---|---|
| `AUTH_SECRET` | 32+ random bytes, unique per environment |
| `AUTH_URL` | `https://your-domain` |
| `DATABASE_URL` | the least-privilege app role |
| `MIGRATION_DATABASE_URL` | the owner role, used only by `npm run db:deploy` |
| `TRUSTED_IP_HEADER` | your platform's client-IP header |
| `MAIL_TRANSPORT` | `none` until an email provider is added |
| `NEXT_PUBLIC_FIREBASE_*` | Optional. Firebase web app config (public identifiers; no Analytics). Set before `npm run build` — the values are built into the browser code |

## Database commands

| Command | What it does |
|---|---|
| `npm run db:migrate -- --name <change>` | Create and apply a migration in development (`prisma migrate dev`) |
| `npm run db:deploy` | Apply pending migrations (CI / production) |
| `npm run db:generate` | Regenerate the Prisma client after schema edits |
| `npm run db:seed` | Load demo data |
| `npm run db:reset` | Drop and re-create the dev database from migrations (destructive); then run `npm run db:seed` |
| `npm run db:studio` | Browse the dev database |

Schema rules, constraints and the migration workflow for hand-written SQL are in [docs/DATABASE.md](docs/DATABASE.md).

## Seed data

`npm run db:seed` (`prisma/seed.ts`) creates a demo user `demo@example.test` with three accounts (USD cash, USD bank, KHR cash), the default categories, a few income and expense entries around today, an ATM transfer, a monthly budget and a savings goal.

The demo password is taken from `SEED_DEMO_PASSWORD` in `.env` (min 10 characters). If it is not set, the seed generates a random password and prints it once. No credentials are stored in the repository.

- **Idempotent:** it deletes and recreates only the demo user; other data is untouched.
- **Guarded:** refuses to run with `NODE_ENV=production` or against a database whose name does not end in `_dev`, `_development` or `_local`.

## Quality checks

```bash
npm run check        # typecheck + lint + format check + unit & integration tests
npm run build        # production build
npm run test:e2e     # Playwright: desktop, tablet and mobile against a production build
npm run format       # apply Prettier formatting
```

Integration tests run against `TEST_DATABASE_URL`, migrate it automatically and truncate it between tests. End-to-end tests build the app and run it against `E2E_DATABASE_URL`, which is migrated and cleaned of test users before each run. If Chromium is already installed (CI images, cloud sandboxes), set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` instead of running `npx playwright install`.

## Easiest way on a Mac

Paste this one line into Terminal. It finds (or downloads) the project, gets the latest version, sets `AUTH_URL`, starts PostgreSQL if Homebrew manages it, installs packages, applies database migrations, starts the app and opens it in your browser:

```bash
curl -fsSL https://raw.githubusercontent.com/chanly2505/Personal-Financial-Management-/main/scripts/start-mac.sh | bash
```

Afterwards, double-click **Start Personal Finance.command** in the project folder to do the same. Keep the Terminal window open while you use the app; close it to stop. Local edits are never deleted — they are saved with `git stash`.

## After every `git pull`

New phases add packages and database migrations. Before starting the app:

```bash
npm run setup        # npm install + prisma generate + prisma migrate deploy
npm run db:status    # optional: confirms the database is up to date
```

Then rebuild if you run the production server (`npm run build && npm start`).

## Troubleshooting

- **Can't sign in / "Something went wrong" right after signing in** — usually the database is missing the latest migrations: run `npm run setup` (or `npm run db:deploy`) and restart. The server log names the missing table. With `npm start`, also check `AUTH_URL` (below).
- **Accounts are created but signing in sends you back to the sign-in page** — `AUTH_URL` is missing in production mode; set it to the address you open (e.g. `http://localhost:3000`) and rebuild. The log shows `"errorType":"UntrustedHost"`.

- **`Invalid environment configuration`** — a variable in `.env` is missing or malformed; the message names it.
- **`Can't reach database server`** — start PostgreSQL (`service postgresql start` in containers).
- **`permission denied for schema public`** during `db:migrate` — set `MIGRATION_DATABASE_URL` to the owner role; the app role cannot change the schema by design.
- **Signed out unexpectedly** — sessions end after 7 days of inactivity, after a password change, or after "Sign out everywhere".
- **`npm install` fails with `Cannot read properties of null (reading 'edgesOut')`** — npm 10 bug; run `npx npm@11 install`.
