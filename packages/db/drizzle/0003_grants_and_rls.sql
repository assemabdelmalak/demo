-- Hand-written (DEPLOYMENT §4): privileges and Row Level Security. See ADR-021 and ADR-022.
-- The four roles are created by sql/bootstrap-roles.sql; the migration runner checks them first.
-- Every table added later needs its own GRANTs and, if it is a tenant table, `enable_tenant_rls`.
-- Tests read the catalog and fail when either is missing.

GRANT USAGE ON SCHEMA public TO app_runtime, app_worker, app_admin;
--> statement-breakpoint
-- The admin role bypasses RLS; it is used only by the super-admin module and is fully audited.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_admin;
--> statement-breakpoint

-- ── Privileges of the API (app_runtime) and the worker (app_worker) ──────────────────────────
-- Explicit per table, not a blanket default: what a role cannot do is part of the design.

-- Better Auth's tables. The API runs Better Auth; the worker only reads who to notify.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON "user", "session", "account", "verification", "organization", "member", "invitation", "two_factor"
  TO app_runtime;
--> statement-breakpoint
GRANT SELECT ON "user", "organization", "member" TO app_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON diner_devices TO app_runtime;
--> statement-breakpoint

-- Ordinary tenant tables: full read and write inside the caller's organisation (RLS below).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  staff_devices, assets, restaurants, restaurant_faq, glossary_terms,
  kitchen_stations, menu_categories, menu_items, menu_item_variants, menu_item_ingredients,
  menu_item_allergens, modifier_groups, modifier_options, menu_item_modifier_groups,
  dining_areas, dining_tables,
  table_sessions, session_participants, order_rounds, session_items, session_item_shares, waiter_calls,
  import_jobs, import_job_pages, chat_conversations, chat_messages,
  notification_optins
  TO app_runtime, app_worker;
--> statement-breakpoint

-- Records that are never deleted: history, money and published snapshots.
GRANT SELECT, INSERT ON exchange_rate_history, menu_versions, bill_snapshots TO app_runtime, app_worker;
--> statement-breakpoint
-- Payments and discounts are voided by an update, never removed (SECURITY T8).
GRANT SELECT, INSERT, UPDATE ON payments, discounts TO app_runtime;
--> statement-breakpoint
GRANT SELECT ON payments, discounts TO app_worker;
--> statement-breakpoint

-- Append-only audit log: nobody but the admin role can change or remove an entry.
GRANT SELECT, INSERT ON audit_logs TO app_runtime, app_worker;
--> statement-breakpoint
-- Outbox rows are written with the change; afterwards only `dispatched_at` may be set.
GRANT SELECT, INSERT ON outbox_events TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (dispatched_at) ON outbox_events TO app_runtime;
--> statement-breakpoint

-- Analytics: the API and worker record events; the worker builds the rollups the API reads.
GRANT SELECT, INSERT ON menu_events TO app_runtime, app_worker;
--> statement-breakpoint
GRANT SELECT ON daily_metrics, daily_dish_metrics, insight_reports, chat_message_labels TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE
  ON daily_metrics, daily_dish_metrics, insight_reports, chat_message_labels
  TO app_worker;
--> statement-breakpoint

-- Platform data: plans and flags are set by the admin role; usage is counted by the apps.
GRANT SELECT ON subscriptions, subscription_payments, feature_flags TO app_runtime, app_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON usage_counters TO app_runtime, app_worker;
--> statement-breakpoint

-- ── Row Level Security ───────────────────────────────────────────────────────────────────────

-- The organisation of the current transaction, set by `withTenant()` with
-- `set_config('app.org_id', …, true)`. Null when no tenant is set, so every comparison fails.
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  RETURN nullif(current_setting('app.org_id', true), '')::uuid;
--> statement-breakpoint

-- Enables RLS on a tenant table with the one standard policy. `(select …)` makes Postgres
-- evaluate the setting once per statement instead of once per row.
CREATE OR REPLACE FUNCTION enable_tenant_rls(target regclass) RETURNS void
  LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', target);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s
       USING (organization_id = (select current_org_id()))
       WITH CHECK (organization_id = (select current_org_id()))',
    target
  );
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION enable_tenant_rls(regclass) FROM PUBLIC;
--> statement-breakpoint

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'staff_devices', 'assets', 'restaurants', 'exchange_rate_history', 'restaurant_faq', 'glossary_terms',
    'kitchen_stations', 'menu_categories', 'menu_items', 'menu_item_variants', 'menu_item_ingredients',
    'menu_item_allergens', 'modifier_groups', 'modifier_options', 'menu_item_modifier_groups', 'menu_versions',
    'dining_areas', 'dining_tables',
    'table_sessions', 'session_participants', 'order_rounds', 'session_items', 'session_item_shares', 'waiter_calls',
    'discounts', 'payments', 'bill_snapshots',
    'import_jobs', 'import_job_pages', 'chat_conversations', 'chat_messages', 'chat_message_labels',
    'menu_events', 'daily_metrics', 'daily_dish_metrics', 'insight_reports',
    'subscriptions', 'subscription_payments', 'usage_counters', 'outbox_events', 'notification_optins'
  ] LOOP
    PERFORM enable_tenant_rls(format('public.%I', tenant_table)::regclass);
  END LOOP;
END
$$;
--> statement-breakpoint

-- audit_logs: an organisation reads its own entries. An entry may be written for the current
-- organisation, or with no organisation only when no tenant is set (system and sign-in events).
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_read ON audit_logs FOR SELECT
  USING (organization_id = (select current_org_id()));
--> statement-breakpoint
CREATE POLICY audit_append ON audit_logs FOR INSERT
  WITH CHECK (organization_id IS NOT DISTINCT FROM (select current_org_id()));
--> statement-breakpoint

-- feature_flags: an organisation sees its own flags and the global defaults (null organisation).
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY flags_read ON feature_flags FOR SELECT
  USING (organization_id IS NULL OR organization_id = (select current_org_id()));
--> statement-breakpoint

-- ── Public reads (the diner menu) ────────────────────────────────────────────────────────────
-- `withPublic()` sets `app.public = 'on'` for the transaction. Nothing else is readable that way.

-- True when the version is the published menu of a live restaurant. SECURITY DEFINER because the
-- caller cannot see `restaurants` without a tenant; it returns one boolean and nothing else.
CREATE OR REPLACE FUNCTION is_published_menu_version(version_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  RETURN EXISTS (
    SELECT FROM restaurants r
    WHERE r.published_menu_version_id = version_id AND r.status = 'live' AND r.deleted_at IS NULL
  );
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION is_published_menu_version(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION is_published_menu_version(uuid) TO app_runtime, app_worker;
--> statement-breakpoint
CREATE POLICY public_published ON menu_versions FOR SELECT
  USING (current_setting('app.public', true) = 'on' AND is_published_menu_version(id));
--> statement-breakpoint

-- Public columns of live restaurants. A view runs with its owner's rights, so it filters itself:
-- live, not deleted, and only inside `withPublic()`. `security_barrier` stops a caller's own
-- predicates from running before that filter.
CREATE VIEW public_restaurants WITH (security_barrier = true) AS
  SELECT
    id, organization_id, slug, name, description, address, city, phone, whatsapp_number,
    instagram_handle, logo_asset_id, cover_asset_id, theme, timezone, default_locale,
    enabled_locales, base_currency, show_secondary_currency, lbp_rate, lbp_rounding_step,
    lbp_rounding_mode, tax_rate_bps, tax_inclusive, tax_applies_to_service, service_charge_bps,
    service_charge_label, ordering_mode, group_ordering_enabled, ai_assistant_enabled,
    opening_hours, published_menu_version_id
  FROM restaurants
  WHERE status = 'live' AND deleted_at IS NULL AND current_setting('app.public', true) = 'on';
--> statement-breakpoint
GRANT SELECT ON public_restaurants TO app_runtime, app_worker;
--> statement-breakpoint

-- ── Lookups that must work before a tenant is known ──────────────────────────────────────────

-- The organisation that owns a restaurant, so a request for `/restaurants/:rid` can check
-- membership and then set the tenant. Returns the ID only.
CREATE OR REPLACE FUNCTION restaurant_org(target_restaurant_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  RETURN (
    SELECT r.organization_id FROM restaurants r
    WHERE r.id = target_restaurant_id AND r.deleted_at IS NULL
  );
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION restaurant_org(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION restaurant_org(uuid) TO app_runtime, app_worker;
--> statement-breakpoint

-- ── menu_events partitions ───────────────────────────────────────────────────────────────────
-- Rows are reached through the parent table, whose policy applies. A partition queried directly
-- would skip that policy, so partitions get RLS with no policy and no grants at all.
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
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_name);
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, app_runtime, app_worker, app_admin', partition_name);
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  partition regclass;
BEGIN
  FOR partition IN
    SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent = 'public.menu_events'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', partition);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, app_runtime, app_worker, app_admin', partition);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Maintenance functions are for the migrator (and, later, a narrow wrapper for the worker).
REVOKE EXECUTE ON FUNCTION ensure_menu_events_partitions(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION ensure_updated_at_triggers() FROM PUBLIC;
