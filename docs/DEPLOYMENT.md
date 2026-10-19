# Deploying

**Production: Railway + Neon** (chosen by the owner on 19 Oct 2026). Railway runs the app as a normal, always-on Node.js server next to the Neon PostgreSQL database.

Cloudflare Workers, Vercel and Netlify were tried in October 2026. Their configuration was removed from the repository in the P3 clean-up (it is in the git history before that commit). If any of those projects still exist in your accounts, delete them: they could still reach the database with old secrets.

## Railway + Neon (current)

**Live:** https://personal-financial-management-production-c29c.up.railway.app (Railway project `jubilant-unity`, region US East). Verified 2026-10-19: deploy healthy, app connected to Neon, owner registered and every page returned 200. Note: `DATABASE_URL` must be the Neon pooled address — a local `localhost` value makes `/api/health` report the database unreachable and sign-in fail with "Something went wrong".

| | |
|---|---|
| Config | Service settings (set 19 Oct 2026 via the Railway connector, mirrored in `railway.json`): pre-deploy `bash scripts/migrate-deploy.sh`, start `npm start`, health check `/api/health` (120 s), restart on failure ×5. **Railway was not applying `railway.json` on this service** (its settings never appeared in the service config and the first P1 deploy skipped the migration), so change these in the dashboard (service → Settings → Deploy) and keep `railway.json` in sync |
| Build | Railway detects Node.js and runs `npm ci` and `npm run build` (`next build`) |
| Region | **US East (Virginia)**, closest to Neon in AWS US East 2 (Ohio) |
| Database | Neon `personal-finance`. Pending migrations are applied by the pre-deploy command (`scripts/migrate-deploy.sh`, owner role via `MIGRATION_DATABASE_URL`) before each new version starts; a failure keeps the previous version running |
| Checks | GitHub Actions (`.github/workflows/ci.yml`) runs `npm run check` and the build on every push; turn on **Wait for CI** (service → Settings) so a red run blocks the deploy |
| Scheduler | `RECURRING_SCHEDULER=in-process`: one always-on server runs recurring items hourly (no separate cron service) |

**Variables** (service → Variables; Railway sets `PORT`):

| Name | Value |
|---|---|
| `DATABASE_URL` | `finance_app` pooled Neon address, `?sslmode=verify-full` |
| `AUTH_SECRET` | 32+ random characters (`openssl rand -base64 32`) |
| `CRON_SECRET` | optional; enables `/api/cron/recurring` for an external scheduler |
| `AUTH_TRUST_HOST` | `true` (Auth.js uses the request's address; or set `AUTH_URL` to the Railway domain) |
| `TRUSTED_IP_HEADER` | `x-real-ip` (Railway's documented client-IP header; community reports say it is not guaranteed spoof-proof, so per-email limits remain the main protection) |
| `RECURRING_SCHEDULER` | `in-process` |
| `AUTH_URL` | `https://personal-financial-management-production-c29c.up.railway.app` |
| `MIGRATION_DATABASE_URL` | Neon **owner** (`neondb_owner`) direct address, `?sslmode=require` (copy the current one from Neon → Connect; an old password fails the deploy with P1000); used only by the pre-deploy migration step |
| `REGISTRATION_MODE` | `allowlist` |
| `REGISTRATION_ALLOWLIST` | the owner's email |

**Steps:** railway.com → New Project → Deploy from GitHub repo → `Personal-Financial-Management-` → Settings → Region **US East** → Variables (above) → Settings → Networking → **Generate Domain** → open `/api/health`.

Verified locally the way Railway runs it (`npm run build`, `npm start` with `PORT` and the variables above): health ok, release checks 4/4, in-process scheduler runs.


## Fresh setup (from nothing)

### 1. Create the database (Neon)

1. Go to <https://neon.tech> → **Sign up** → **Continue with GitHub**.
2. Create a project: name `personal-finance`, PostgreSQL version 17, region **AWS US East 2 (Ohio)** (close to Railway's US East region). The database is called `neondb` and its owner `neondb_owner`. Keep those names.

### 2. Add a limited user for the app

The app should not use the owner account: the owner can delete tables, and the app only needs to read and write rows (docs/SECURITY.md §8).

1. Make a password for it: on your Mac, open **Terminal** and run `openssl rand -hex 24`. Copy the result (letters and digits only, so it is safe inside a connection string).
2. In Neon open **SQL Editor**, paste the whole content of [`prisma/sql/app-role-neon.sql`](../prisma/sql/app-role-neon.sql) from GitHub, replace `REPLACE_WITH_THE_PASSWORD` with that value, and click **Run**. It should finish without errors.

Create this user **with the SQL script, not with the "New role" button**: Neon gives roles created in its console membership of `neon_superuser`, which could create roles and databases — the opposite of a limited user. The script creates the role without it and removes it if the role already exists.

### 3. Copy the two connection strings

On the Neon project **Dashboard**, click **Connect**:

| Variable in Railway | Role | "Connection pooling" | Looks like |
|---|---|---|---|
| `MIGRATION_DATABASE_URL` | `neondb_owner` | **Off** | `postgresql://neondb_owner:…@ep-….us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `DATABASE_URL` | Neon only lists console roles, so copy the `neondb_owner` string with pooling **on** (the host contains `-pooler`) and replace `neondb_owner:<its password>` with `finance_app:<your password from step 2>`, and the ending `?sslmode=require…` with `?sslmode=verify-full` | **On** | `postgresql://finance_app:…@ep-…-pooler.us-east-2.aws.neon.tech/neondb?sslmode=verify-full` |

`verify-full` is what the app's database driver does anyway for `require` (full certificate check); writing it explicitly avoids a warning in the logs on every start. Leave `MIGRATION_DATABASE_URL` exactly as Neon shows it — the migration tool reads it differently.

Keep them private: they contain passwords. Never put them in the code or in a GitHub issue.

### 4. Make a random secret

On your Mac, open **Terminal** and run this, copying the result:

```bash
openssl rand -base64 32
```

Use it as `AUTH_SECRET` (protects sign-in cookies). Use a new value, not the one in your Mac's `.env`. (`CRON_SECRET` is only needed if an outside scheduler calls `/api/cron/recurring`; make it the same way.)

### 5. Create the service (Railway)

1. <https://railway.com> → **New Project → Deploy from GitHub repo** → `Personal-Financial-Management-`.
2. Service → **Settings**: region **US East**; Deploy → pre-deploy command `bash scripts/migrate-deploy.sh`, start command `npm start`, health check path `/api/health`; turn on **Wait for CI**. (Railway did not pick these up from `railway.json` on the current service, so set them here.)
3. Service → **Variables**: the table above.
4. Settings → Networking → **Generate Domain**, then set `AUTH_URL` to that address.

### 6. Check that it works

1. Open `https://<your-address>/api/health` → `"status":"ok","database":"ok"` and the deployed commit as `version`.
2. Run the release checks: `RELEASE_URL=https://<your-address> RELEASE_CRON_SECRET=<CRON_SECRET, if set> npm run release:check`. They sign up throwaway `release-check-…@example.test` accounts (allow them in `REGISTRATION_ALLOWLIST` for the run, or set `REGISTRATION_MODE=open` briefly), check every main flow and isolation, then delete the test accounts.
3. Within the hour, the logs show `recurring.run_finished` from the in-process scheduler.

### Notes and limits

- **Owner password on Railway:** `MIGRATION_DATABASE_URL` is only read by the pre-deploy step, but it is visible to the service. For a stricter setup, remove the pre-deploy command and the variable, and run `npx prisma migrate deploy` from your computer before each release with a migration.
- **Direct database access:** authorization is enforced by the app; anyone holding a database password could read every user's rows. Passwords live only in Railway's variables (and the owner's on your Mac for backups); connections require TLS; the app's own role cannot change the schema or create roles.
- **Rate limits:** keep `TRUSTED_IP_HEADER=x-real-ip`. Without it, per-IP limits are off (the app logs `security.ip_rate_limits_disabled`).
- **Password reset e-mails** are off until an e-mail provider is chosen (PRD Q-12); the owner can reset a password with `npm run user:reset-password` (OPERATIONS.md).
- **Backups:** Neon Free keeps 6 hours of history and one manual snapshot; keep the weekly `scripts/backup-db.sh` dumps (OPERATIONS.md).
