-- Least-privilege runtime role on Neon (docs/DEPLOYMENT.md step 2).
--
-- Same grants as prisma/sql/app-role.sql, written as plain SQL for the Neon
-- SQL Editor (which has no psql variables). Run it as the database owner
-- (`neondb_owner`), once, after replacing REPLACE_WITH_THE_PASSWORD with a long
-- random password (e.g. `openssl rand -hex 24`). Re-runnable.
--
-- The role is created here, not with Neon's "New role" button: console-created
-- roles are made members of `neon_superuser` (CREATEROLE, CREATEDB), which would
-- undo the point of a limited role (QA-15).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_app') THEN
    CREATE ROLE finance_app LOGIN PASSWORD 'REPLACE_WITH_THE_PASSWORD';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser')
     AND pg_has_role('finance_app', 'neon_superuser', 'MEMBER') THEN
    EXECUTE 'REVOKE neon_superuser FROM finance_app';
  END IF;
END $$;
-- A role created this way has no SUPERUSER, CREATEDB or CREATEROLE power.
-- (No `ALTER ROLE … NOSUPERUSER …` here: on PostgreSQL 16+ only a superuser may
-- run it, and Neon's owner is not one — found on the first real Neon setup.)
-- Check afterwards:
--   SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'finance_app';

GRANT CONNECT ON DATABASE neondb TO finance_app;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO finance_app;

-- Tables that already exist (none on a fresh database)…
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finance_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finance_app;

-- …and every table the migrations create later.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO finance_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO finance_app;

-- The migration history belongs to the owner only (runs again safely once it exists).
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM finance_app;
  END IF;
END $$;
