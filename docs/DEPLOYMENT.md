# Deploying

**Current target: Vercel + Neon** (approved by the owner on 18 Oct 2026). The app runs on Vercel (Hobby, region `cle1` — Cleveland, US East) next to the existing Neon database in AWS US East 2 (Ohio). The Netlify configuration below remains as an alternative.

## Vercel + Neon (current)

| | |
|---|---|
| Database | Neon project `personal-finance` (`raspy-waterfall-82036981`), PostgreSQL 17, AWS US East 2 (Ohio). Limited role `finance_app` created and verified; no tables yet — the first production build creates them. |
| App | Vercel Hobby, functions in `cle1` (`vercel.json`), daily job at 17:05 UTC (`/api/cron/recurring`) |
| Build | `vercel-build`: `prisma migrate deploy` on production builds only, then `next build` |

**Credentials to rotate first.** The `finance_app` and `neondb_owner` passwords used during the Netlify attempt passed through a chat session, so both are replaced before Vercel is set up (steps 1–2).

**Steps (the owner, in the browser):**

1. **New app password** — Neon console → project `personal-finance` → **SQL Editor**. On your Mac run `openssl rand -hex 24`, then run in the editor (with that value):
   `ALTER ROLE finance_app PASSWORD 'PASTE_THE_VALUE';`
2. **New owner password** — Neon console → **Roles** → `neondb_owner` → **Reset password**.
3. **Connection strings** — Neon → **Connect**:
   - `MIGRATION_DATABASE_URL`: role `neondb_owner`, **Connection pooling off**, copy exactly as shown.
   - `DATABASE_URL`: `postgresql://finance_app:PASSWORD_FROM_STEP_1@ep-morning-resonance-b5x68340-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=verify-full`
4. **Two secrets** — on your Mac run `openssl rand -base64 32` twice: `AUTH_SECRET`, `CRON_SECRET`.
5. **Vercel** — vercel.com → Continue with GitHub → **Add New… → Project** → import **Personal-Financial-Management-** → Environment Variables (each **Production only**; mark the two URLs **Sensitive**): `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `TRUSTED_IP_HEADER=x-real-ip` → **Deploy**.
6. **Pin the address** — Settings → Environment Variables → `AUTH_URL=https://<your-address>` (Production) → Deployments → **Redeploy**.
7. **Verification (Claude)** — `/api/health`, then `RELEASE_URL=… RELEASE_CRON_SECRET=… npm run release:check` from a session whose network policy allows the address.
8. **Clean-up (Claude, with the owner's OK)** — remove the Netlify site's environment variables (or the site), then add the live address to README.md and mark Phase 12 done.

---

## Netlify + Neon (alternative, configured)

| | |
|---|---|
| Netlify site | `chanly-personal-finance` — <https://chanly-personal-finance.netlify.app> (team `chanly2505`, site id `5347deed-b7a4-4839-8ede-87d3306b8b0a`) |
| Server region | Netlify Functions run in US East (Ohio, `cmh`) on the free plan (choosing a region needs Pro) |
| Database | Neon PostgreSQL 17 in **AWS US East 2 (Ohio)** — next to the functions, so the several queries per page stay fast |
| Build | `netlify.toml` → `npm run netlify-build`: `prisma migrate deploy` on production deploys only (`CONTEXT=production`), then `next build`; Netlify's Next.js runtime is added automatically |
| Scheduler | `netlify/functions/scheduled-jobs.mts`, hourly at :05 UTC, calls `/api/cron/recurring` with `CRON_SECRET` (recurring items post hourly) |
| Client IP header | `TRUSTED_IP_HEADER=x-nf-client-connection-ip` |

**Status (18 Oct 2026):** Neon project `personal-finance` (`raspy-waterfall-82036981`, PostgreSQL 17, AWS US East 2) created; `finance_app` role created and verified (no superuser/createrole/createdb, cannot create in `public`); Netlify Production environment variables set (`MIGRATION_DATABASE_URL` scoped to builds only, so the running app cannot read the owner password). First deploy attempt blocked: the Claude cloud environment's network policy refuses `netlify-mcp.netlify.app`, `api.netlify.com` and `*.netlify.app` (proxy 403). Next: once those are allowed (environment settings → Network access → Allowed domains), deploy and run the release checks. Upload with `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` so Node's fetch uses the proxy.

**Remaining steps (Claude, in the next session):**

1. Neon (connector): create project `personal-finance`, PostgreSQL 17, region `aws-us-east-2`.
2. Create the limited `finance_app` role: run `prisma/sql/app-role-neon.sql` with a freshly generated password (`openssl rand -hex 24`), never committed.
3. Connection strings: `MIGRATION_DATABASE_URL` = owner, direct (as Neon shows it); `DATABASE_URL` = `finance_app`, pooled host (`-pooler`), ending `?sslmode=verify-full`.
4. Netlify environment variables (manage-env-vars), **Production context only**, scopes builds + functions, marked secret: `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `AUTH_SECRET` and `CRON_SECRET` (each `openssl rand -base64 32`), `AUTH_URL=https://chanly-personal-finance.netlify.app`, `TRUSTED_IP_HEADER=x-nf-client-connection-ip`.
5. Deploy with the Netlify deploy tool **from a clean export of the committed files** (`git archive HEAD | tar -x -C <empty dir>`), so a local `.env` can never be uploaded.
6. Verify: `/api/health` (status ok, version = commit), then `RELEASE_URL=https://chanly-personal-finance.netlify.app RELEASE_CRON_SECRET=… npm run release:check`; check the scheduled function in Netlify → Logs → Functions.
7. Only after that: add the address to README.md and mark Phase 12 done.

---

## Vercel + Neon — detailed guide (fresh setup)

The app runs on **Vercel** (free *Hobby* plan, made for Next.js) with its data in **Neon** (free PostgreSQL). Both sign in with your GitHub account. No credit card is needed. Every time new code is pushed to `main`, Vercel rebuilds the site and applies any database changes automatically.

> Why not Firebase? Firebase can host this kind of app only on its paid Blaze plan, and it has no PostgreSQL database. The Firebase web settings (`NEXT_PUBLIC_FIREBASE_*`) still work on Vercel if you add them.

**What the free plans include (enough for personal use)**

| | Free limit | What it means for you |
|---|---|---|
| Neon | 0.5 GB of data; the database sleeps after 5 minutes without use | Hundreds of thousands of transactions fit. The first page after a quiet period takes about a second longer. |
| Vercel Hobby | Personal, non-commercial use; generous traffic | Fine for you and your family. |
| Vercel Cron (Hobby) | Once a day | Recurring transactions post once a day, just after midnight Cambodia time (§5). |

Configured in the repository: `vercel.json` (servers in Cleveland `cle1`, next to the Ohio database; the daily recurring job), the `vercel-build` script in `package.json` (applies database migrations on production builds only, then builds), and `prisma/sql/app-role-neon.sql` (a limited database user for the app).

### 1. Create the database (Neon)

1. Go to <https://neon.tech> → **Sign up** → **Continue with GitHub**.
2. Create a project: name `personal-finance`, PostgreSQL version 17, region **AWS US East 2 (Ohio)** (it must match the `vercel.json` region `cle1`). The database is called `neondb` and its owner `neondb_owner`. Keep those names.

### 2. Add a limited user for the app

The app should not use the owner account: the owner can delete tables, and the app only needs to read and write rows (docs/SECURITY.md §8).

1. Make a password for it: on your Mac, open **Terminal** and run `openssl rand -hex 24`. Copy the result (letters and digits only, so it is safe inside a connection string).
2. In Neon open **SQL Editor**, paste the whole content of [`prisma/sql/app-role-neon.sql`](../prisma/sql/app-role-neon.sql) from GitHub, replace `REPLACE_WITH_THE_PASSWORD` with that value, and click **Run**. It should finish without errors.

Create this user **with the SQL script, not with the "New role" button**: Neon gives roles created in its console membership of `neon_superuser`, which could create roles and databases — the opposite of a limited user. The script creates the role without it and removes it if the role already exists.

### 3. Copy the two connection strings

On the Neon project **Dashboard**, click **Connect**:

| Setting in Vercel | Role | "Connection pooling" | Looks like |
|---|---|---|---|
| `MIGRATION_DATABASE_URL` | `neondb_owner` | **Off** | `postgresql://neondb_owner:…@ep-…ap-southeast-1.aws.neon.tech/neondb?sslmode=require` |
| `DATABASE_URL` | Neon only lists console roles, so copy the `neondb_owner` string with pooling **on** (the host contains `-pooler`) and replace `neondb_owner:<its password>` with `finance_app:<your password from step 2>`, and the ending `?sslmode=require…` with `?sslmode=verify-full` | **On** | `postgresql://finance_app:…@ep-…-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full` |

`verify-full` is what the app's database driver does anyway for `require` (full certificate check); writing it explicitly avoids a warning in the logs on every start. Leave `MIGRATION_DATABASE_URL` exactly as Neon shows it — the migration tool reads it differently.

Keep them private: they contain passwords. Never put them in the code or in a GitHub issue.

### 4. Make two random secrets

On your Mac, open **Terminal** and run this **twice**, copying each result:

```bash
openssl rand -base64 32
```

The first is `AUTH_SECRET` (protects sign-in cookies), the second is `CRON_SECRET` (protects the recurring job). Use new values, not the ones in your Mac's `.env`.

### 5. Create the site (Vercel)

1. Go to <https://vercel.com/signup> → **Hobby** → **Continue with GitHub**.
2. **Add New… → Project** → find **Personal-Financial-Management-** → **Import**. (If it is not listed, click *Adjust GitHub App Permissions* and allow that repository.)
3. Leave Framework (Next.js) and the build settings as they are. Open **Environment Variables** and add the values below. For **each** one, set *Environments* to **Production only** (untick Preview and Development): otherwise every pushed branch would run with your real database and secrets.

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | from step 3 (finance_app, pooled) |
   | `MIGRATION_DATABASE_URL` | from step 3 (neondb_owner, direct) |
   | `AUTH_SECRET` | first value from step 4 |
   | `CRON_SECRET` | second value from step 4 |
   | `TRUSTED_IP_HEADER` | `x-real-ip` |
   | `NEXT_PUBLIC_FIREBASE_…` | optional — the same six values as in your Mac's `.env` |

4. Click **Deploy**. The first build takes a few minutes; it creates all the tables in Neon. When it finishes, Vercel shows your address, e.g. `https://personal-financial-management.vercel.app`.

Sign-in works on Vercel without `AUTH_URL` (Auth.js detects the Vercel address). If you later add your own domain, add `AUTH_URL=https://your-domain` and redeploy.

### 6. Check that it works

1. Open `https://<your-address>/api/health` → it should show `"status":"ok","database":"ok"` and a `version` that matches the latest commit on GitHub.
2. **Pin the address:** Vercel → Settings → Environment Variables → add `AUTH_URL` = `https://<your-address>` (Production) → **Deployments → Redeploy**. Sign-in already works without it; pinning it makes every sign-in link use your real address.
3. **Send the address to Claude** (or run it yourself on your Mac): `RELEASE_URL=https://<your-address> RELEASE_CRON_SECRET=<your CRON_SECRET> npm run release:check`. It signs up a throwaway `release-check-…@example.test` account, checks registration, sign-in, protected pages, accounts, income/expense, transfers, balances, budgets, dashboard, reports and CSV export, isolation between users, phone layout and the scheduled job — then deletes the two test accounts (also when a check fails). Run it at most twice an hour: production allows 5 sign-ups per IP per hour.
4. The next day, Vercel → your project → **Settings → Cron Jobs** shows the recurring job's last run (it calls `/api/cron/recurring` daily at 17:05 UTC = 00:05 in Phnom Penh).

The data on Vercel is separate from your Mac. To start fresh online, just register there.

### 7. After the first deploy

- **Uptime alert (optional, free):** create a monitor at <https://uptimerobot.com> for `https://<your-address>/api/health` every 5 minutes; you get an e-mail if it fails.
- **First backup:** on your Mac, `brew install libpq && brew link --force libpq`, then `BACKUP_DATABASE_URL="<neondb_owner direct URL>" scripts/backup-db.sh` and `scripts/verify-backup.sh <the file it printed>`. Repeat weekly — see [OPERATIONS.md §Backups](OPERATIONS.md#backups).
- **Updating:** nothing to do — every push to `main` redeploys and applies database changes (`vercel-build`). If a build fails, the previous version stays online; the build log is under **Deployments**. To undo a bad release: **Deployments → last good one → ⋯ → Instant Rollback** ([OPERATIONS.md](OPERATIONS.md#rolling-back-an-application-deployment)).

### Notes and limits

- **Owner password on Vercel:** `MIGRATION_DATABASE_URL` is needed by the build to create and update tables, but Vercel also makes it visible to the running app (the app itself never reads it). Mark it **Sensitive** in Vercel. For a stricter setup, run `npx prisma migrate deploy` yourself before each release with that URL set only on your Mac, and remove it from Vercel.
- **Direct database access:** authorization (who may see which records) is enforced by the app; anyone holding a database password could read every user's rows. So the passwords live only in Vercel's Production variables (and the owner's on your Mac for backups), connections require TLS, and the app's own role cannot change the schema or create roles. Neon's IP allow-list (paid plans) can additionally restrict who may connect.
- **Rate limits:** keep `TRUSTED_IP_HEADER=x-real-ip`. Without it, per-IP sign-in and registration limits are off (the app logs `security.ip_rate_limits_disabled` at start-up).

- **Password reset e-mails** are off until an e-mail provider is chosen (PRD Q-12). Users can still change their password in Settings while signed in.
- **Recurring transactions post once a day** on the free plan. A rule that is due is posted by the next daily run; the Recurring page shows "Due — posts on the next scheduled run" until then. For hourly runs, upgrade Vercel or call `/api/cron/recurring` hourly from any scheduler with `Authorization: Bearer <CRON_SECRET>` (docs/OPERATIONS.md).
- **Backups:** Neon's free plan keeps only a short restore window, so keep the weekly `scripts/backup-db.sh` dumps (see step 7 and OPERATIONS.md).
- **Preview deployments** (other branches) do not run migrations. Leave the environment variables on *Production* only unless you set up a separate preview database.
