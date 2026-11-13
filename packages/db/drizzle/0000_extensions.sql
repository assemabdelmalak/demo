-- Extensions required by DATA_MODEL §0. All three are "trusted", so the database owner
-- (app_migrator) can create them without superuser rights.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
-- `unaccent()` is only STABLE, and a generated column needs IMMUTABLE. This wrapper names the
-- dictionary and the schema explicitly, so its result cannot change with the search path and a
-- dump can be restored (the generated `menu_items.search_text` column depends on it).
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  RETURN public.unaccent('public.unaccent'::regdictionary, $1);
