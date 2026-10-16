-- Keep Prisma's migration history out of reach of the runtime role.
--
-- On a hosted database the runtime role (finance_app) gets read/write on new
-- tables through default privileges (prisma/sql/app-role-neon.sql), which would
-- include _prisma_migrations, created by the first `prisma migrate deploy`.
-- No data or schema change; a no-op where the role does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_app') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM finance_app;
  END IF;
END $$;
