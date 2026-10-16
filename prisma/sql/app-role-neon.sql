-- Least-privilege runtime role on Neon (docs/DEPLOYMENT.md step 2).
--
-- Same grants as prisma/sql/app-role.sql, written as plain SQL for the Neon
-- SQL Editor (which has no psql variables). Before running it, create the role
-- `finance_app` in the Neon console (Branches → main → Roles → New role) and
-- copy its password. Run this as the database owner (`neondb_owner`), once.
-- Re-runnable.

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
