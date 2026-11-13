-- Run ONCE per Postgres cluster by a superuser, then once per database (see the second half).
-- Idempotent. Creates the four roles the application uses, without passwords: the operator sets
-- those separately (`ALTER ROLE app_runtime PASSWORD '…'`), so no credential lives in the repo.
--
--   app_migrator  owns the schema; used only by `node dist/migrate.js`
--   app_runtime   the API; subject to Row Level Security
--   app_worker    the background worker; subject to Row Level Security
--   app_admin     the super-admin module only; bypasses Row Level Security
--
-- Migrations cannot do this themselves: creating roles and granting BYPASSRLS need a superuser,
-- and the schema owner must not be one (ADR-021).

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['app_migrator', 'app_runtime', 'app_worker', 'app_admin'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I LOGIN', role_name);
    END IF;
  END LOOP;
END
$$;

ALTER ROLE app_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE app_runtime  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE app_worker   NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE app_admin    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;

-- Per database: the migrator owns it (so it can create the schema, extensions and tables), and
-- only the application roles may connect.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I OWNER TO app_migrator', current_database());
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO app_runtime, app_worker, app_admin',
    current_database()
  );
END
$$;

ALTER SCHEMA public OWNER TO app_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
