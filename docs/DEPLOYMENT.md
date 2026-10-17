# Deploying for free (Vercel + Neon)

The app runs on **Vercel** (free *Hobby* plan, made for Next.js) with its data in **Neon** (free PostgreSQL). Both sign in with your GitHub account. No credit card is needed. Every time new code is pushed to `main`, Vercel rebuilds the site and applies any database changes automatically.

> Why not Firebase? Firebase can host this kind of app only on its paid Blaze plan, and it has no PostgreSQL database. The Firebase web settings (`NEXT_PUBLIC_FIREBASE_*`) still work on Vercel if you add them.

**What the free plans include (enough for personal use)**

| | Free limit | What it means for you |
|---|---|---|
| Neon | 0.5 GB of data; the database sleeps after 5 minutes without use | Hundreds of thousands of transactions fit. The first page after a quiet period takes about a second longer. |
| Vercel Hobby | Personal, non-commercial use; generous traffic | Fine for you and your family. |
| Vercel Cron (Hobby) | Once a day | Recurring transactions post once a day, just after midnight Cambodia time (§5). |

Configured in the repository: `vercel.json` (servers in Singapore, next to the database; the daily recurring job), the `vercel-build` script in `package.json` (applies database migrations on production builds only, then builds), and `prisma/sql/app-role-neon.sql` (a limited database user for the app).

## 1. Create the database (Neon)

1. Go to <https://neon.tech> → **Sign up** → **Continue with GitHub**.
2. Create a project: name `personal-finance`, PostgreSQL version 17, region **AWS Asia Pacific (Singapore)**. The database is called `neondb` and its owner `neondb_owner`. Keep those names.

## 2. Add a limited user for the app

The app should not use the owner account: the owner can delete tables, and the app only needs to read and write rows (docs/SECURITY.md §8).

1. Make a password for it: on your Mac, open **Terminal** and run `openssl rand -hex 24`. Copy the result (letters and digits only, so it is safe inside a connection string).
2. In Neon open **SQL Editor**, paste the whole content of [`prisma/sql/app-role-neon.sql`](../prisma/sql/app-role-neon.sql) from GitHub, replace `REPLACE_WITH_THE_PASSWORD` with that value, and click **Run**. It should finish without errors.

Create this user **with the SQL script, not with the "New role" button**: Neon gives roles created in its console membership of `neon_superuser`, which could create roles and databases — the opposite of a limited user. The script creates the role without it and removes it if the role already exists.

## 3. Copy the two connection strings

On the Neon project **Dashboard**, click **Connect**:

| Setting in Vercel | Role | "Connection pooling" | Looks like |
|---|---|---|---|
| `MIGRATION_DATABASE_URL` | `neondb_owner` | **Off** | `postgresql://neondb_owner:…@ep-…ap-southeast-1.aws.neon.tech/neondb?sslmode=require` |
| `DATABASE_URL` | Neon only lists console roles, so copy the `neondb_owner` string with pooling **on** (the host contains `-pooler`) and replace `neondb_owner:<its password>` with `finance_app:<your password from step 2>`, and the ending `?sslmode=require…` with `?sslmode=verify-full` | **On** | `postgresql://finance_app:…@ep-…-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full` |

`verify-full` is what the app's database driver does anyway for `require` (full certificate check); writing it explicitly avoids a warning in the logs on every start. Leave `MIGRATION_DATABASE_URL` exactly as Neon shows it — the migration tool reads it differently.

Keep them private: they contain passwords. Never put them in the code or in a GitHub issue.

## 4. Make two random secrets

On your Mac, open **Terminal** and run this **twice**, copying each result:

```bash
openssl rand -base64 32
```

The first is `AUTH_SECRET` (protects sign-in cookies), the second is `CRON_SECRET` (protects the recurring job). Use new values, not the ones in your Mac's `.env`.

## 5. Create the site (Vercel)

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

## 6. Check that it works

1. Open `https://<your-address>/api/health` → it should show `"status":"ok","database":"ok"` and a `version` that matches the latest commit on GitHub.
2. **Pin the address:** Vercel → Settings → Environment Variables → add `AUTH_URL` = `https://<your-address>` (Production) → **Deployments → Redeploy**. Sign-in already works without it; pinning it makes every sign-in link use your real address.
3. **Send the address to Claude** (or run it yourself on your Mac): `RELEASE_URL=https://<your-address> RELEASE_CRON_SECRET=<your CRON_SECRET> npm run release:check`. It signs up a throwaway `release-check-…@example.test` account, checks registration, sign-in, protected pages, accounts, income/expense, transfers, balances, budgets, dashboard, reports and CSV export, isolation between users, phone layout and the scheduled job — then deletes the two test accounts (also when a check fails). Run it at most twice an hour: production allows 5 sign-ups per IP per hour.
4. The next day, Vercel → your project → **Settings → Cron Jobs** shows the recurring job's last run (it calls `/api/cron/recurring` daily at 17:05 UTC = 00:05 in Phnom Penh).

The data on Vercel is separate from your Mac. To start fresh online, just register there.

## 7. After the first deploy

- **Uptime alert (optional, free):** create a monitor at <https://uptimerobot.com> for `https://<your-address>/api/health` every 5 minutes; you get an e-mail if it fails.
- **First backup:** on your Mac, `brew install libpq && brew link --force libpq`, then `BACKUP_DATABASE_URL="<neondb_owner direct URL>" scripts/backup-db.sh` and `scripts/verify-backup.sh <the file it printed>`. Repeat weekly — see [OPERATIONS.md §Backups](OPERATIONS.md#backups).
- **Updating:** nothing to do — every push to `main` redeploys and applies database changes (`vercel-build`). If a build fails, the previous version stays online; the build log is under **Deployments**. To undo a bad release: **Deployments → last good one → ⋯ → Instant Rollback** ([OPERATIONS.md](OPERATIONS.md#rolling-back-an-application-deployment)).

## Notes and limits

- **Owner password on Vercel:** `MIGRATION_DATABASE_URL` is needed by the build to create and update tables, but Vercel also makes it visible to the running app (the app itself never reads it). Mark it **Sensitive** in Vercel. For a stricter setup, run `npx prisma migrate deploy` yourself before each release with that URL set only on your Mac, and remove it from Vercel.
- **Direct database access:** authorization (who may see which records) is enforced by the app; anyone holding a database password could read every user's rows. So the passwords live only in Vercel's Production variables (and the owner's on your Mac for backups), connections require TLS, and the app's own role cannot change the schema or create roles. Neon's IP allow-list (paid plans) can additionally restrict who may connect.
- **Rate limits:** keep `TRUSTED_IP_HEADER=x-real-ip`. Without it, per-IP sign-in and registration limits are off (the app logs `security.ip_rate_limits_disabled` at start-up).

- **Password reset e-mails** are off until an e-mail provider is chosen (PRD Q-12). Users can still change their password in Settings while signed in.
- **Recurring transactions post once a day** on the free plan. A rule that is due is posted by the next daily run; the Recurring page shows "Due — posts on the next scheduled run" until then. For hourly runs, upgrade Vercel or call `/api/cron/recurring` hourly from any scheduler with `Authorization: Bearer <CRON_SECRET>` (docs/OPERATIONS.md).
- **Backups:** Neon's free plan keeps only a short restore window, so keep the weekly `scripts/backup-db.sh` dumps (see step 7 and OPERATIONS.md).
- **Preview deployments** (other branches) do not run migrations. Leave the environment variables on *Production* only unless you set up a separate preview database.
