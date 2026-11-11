-- Extensions required by DATA_MODEL §0. All three are "trusted", so the database owner
-- (app_migrator) can create them without superuser rights.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
