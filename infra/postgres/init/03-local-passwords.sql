-- LOCAL DEVELOPMENT ONLY. The roles themselves come from packages/db/sql/bootstrap-roles.sql,
-- which the compose file mounts as 02-bootstrap-roles.sql and which sets no passwords (ADR-021).
-- These match the URLs in .env.example. In staging and production the operator sets real ones.
ALTER ROLE app_migrator PASSWORD 'app_migrator';
ALTER ROLE app_runtime PASSWORD 'app_runtime';
ALTER ROLE app_worker PASSWORD 'app_worker';
ALTER ROLE app_admin PASSWORD 'app_admin';
