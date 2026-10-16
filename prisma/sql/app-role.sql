-- Least-privilege runtime role for the application (docs/SECURITY.md §8).
--
-- The schema owner (MIGRATION_DATABASE_URL) runs migrations; the app connects as
-- a role that can only read and write rows. It cannot create, alter or drop
-- tables, and cannot touch Prisma's migration history.
--
-- Usage (as a superuser or the database owner), once per database:
--   psql "<owner connection string>" \
--     -v app_role=finance_app -v app_password='<strong password>' \
--     -v owner_role=finance -f prisma/sql/app-role.sql
--
-- Re-runnable. Run it again after creating a new database; future tables are
-- covered automatically by the default privileges below.

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_role', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec

SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_role', :'app_password') \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_role') \gexec

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_role";

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
REVOKE ALL ON TABLE public._prisma_migrations FROM :"app_role";

ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";
