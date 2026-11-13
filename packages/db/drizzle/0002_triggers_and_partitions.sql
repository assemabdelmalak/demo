-- Hand-written: things Drizzle's schema cannot express.

-- 1. `updated_at` follows every UPDATE, including raw SQL and bulk statements (DATA_MODEL §0).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Adds the trigger to every table in `public` that has an `updated_at` column and lacks it.
-- Later migrations that add such a table call this again; a test fails if one is missed.
CREATE OR REPLACE FUNCTION ensure_updated_at_triggers() RETURNS void
  LANGUAGE plpgsql
AS $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.oid::regclass AS relation
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'updated_at' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND NOT EXISTS (
        SELECT FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = 'set_updated_at'
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      target.relation
    );
  END LOOP;
END
$$;
--> statement-breakpoint
SELECT ensure_updated_at_triggers();
--> statement-breakpoint
-- 2. Monthly partitions of `menu_events` (DATA_MODEL §9). Creates the partition for the current
-- month and the next `months_ahead` months if they do not exist; safe to call repeatedly. The
-- `db.maintenance` job calls it daily so a partition always exists before its month starts.
CREATE OR REPLACE FUNCTION ensure_menu_events_partitions(months_ahead integer DEFAULT 2) RETURNS void
  LANGUAGE plpgsql
AS $$
DECLARE
  month_start date;
  partition_name text;
BEGIN
  FOR offset_months IN 0..months_ahead LOOP
    month_start := (date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => offset_months))::date;
    partition_name := format('menu_events_y%sm%s', to_char(month_start, 'YYYY'), to_char(month_start, 'MM'));
    IF to_regclass(format('public.%I', partition_name)) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.menu_events FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        (month_start::timestamp AT TIME ZONE 'UTC'),
        ((month_start + interval '1 month')::timestamp AT TIME ZONE 'UTC')
      );
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
SELECT ensure_menu_events_partitions(2);
