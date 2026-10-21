-- LOCAL DEVELOPMENT ONLY. Creates the three login roles named in .env.example so the apps can
-- connect from day one. P1-T03 owns the real role definitions, grants and RLS (ADR-014);
-- its migration must stay idempotent against these roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator LOGIN PASSWORD 'app_migrator';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN PASSWORD 'app_runtime' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin LOGIN PASSWORD 'app_admin' BYPASSRLS;
  END IF;
END
$$;

ALTER DATABASE radd OWNER TO app_migrator;
ALTER SCHEMA public OWNER TO app_migrator;
GRANT CONNECT ON DATABASE radd TO app_runtime, app_admin;
GRANT USAGE ON SCHEMA public TO app_runtime, app_admin;
