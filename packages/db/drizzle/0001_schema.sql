CREATE TYPE "public"."actor_type" AS ENUM('user', 'staff_device', 'diner', 'system', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."allergen_code" AS ENUM('gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk', 'tree_nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs');--> statement-breakpoint
CREATE TYPE "public"."allergen_status" AS ENUM('contains', 'may_contain', 'free', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."answer_status" AS ENUM('answered', 'deferred_to_staff', 'data_missing', 'refused', 'error');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('image', 'pdf', 'spreadsheet', 'export', 'other');--> statement-breakpoint
CREATE TYPE "public"."chat_intent" AS ENUM('ingredients', 'allergen', 'diet', 'recommendation', 'price', 'substitution', 'availability', 'restaurant_info', 'ordering_help', 'off_topic', 'other');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('USD', 'LBP');--> statement-breakpoint
CREATE TYPE "public"."diet_tag" AS ENUM('vegetarian', 'vegan', 'pescatarian', 'halal', 'alcohol', 'contains_pork');--> statement-breakpoint
CREATE TYPE "public"."discount_scope" AS ENUM('item', 'participant', 'bill');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('queued', 'processing', 'needs_review', 'applying', 'applied', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."item_tag" AS ENUM('new', 'chef_pick', 'popular', 'signature', 'seasonal');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'ar', 'fr');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'staff', 'kitchen');--> statement-breakpoint
CREATE TYPE "public"."ordering_mode" AS ENUM('browse_only', 'staff_entry', 'diner_with_approval', 'diner_direct');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('host', 'guest');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('active', 'left', 'removed', 'pending_approval');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash_usd', 'cash_lbp', 'card', 'whish', 'omt', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."plan_code" AS ENUM('free', 'pro', 'bundle');--> statement-breakpoint
CREATE TYPE "public"."restaurant_status" AS ENUM('draft', 'live', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('pending_approval', 'accepted', 'partially_accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."session_item_status" AS ENUM('draft', 'pending_approval', 'accepted', 'preparing', 'ready', 'served', 'rejected', 'voided', 'removed');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('open', 'bill_requested', 'closed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."split_mode" AS ENUM('by_person', 'equal', 'custom');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'grace', 'expired', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."suggestion_source" AS ENUM('ai', 'import_text', 'owner');--> statement-breakpoint
CREATE TYPE "public"."waiter_call_status" AS ENUM('open', 'acknowledged', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."waiter_call_type" AS ENUM('call_waiter', 'request_bill', 'water', 'allergy_help', 'other');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "member_role",
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pin_hash" text,
	"display_name" text,
	CONSTRAINT "member_org_user_uq" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"country" text DEFAULT 'LB' NOT NULL,
	"plan" "plan_code" DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"terms_version_accepted" text,
	"terms_accepted_at" timestamp with time zone,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organization_status_check" CHECK ("organization"."status" in ('active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organization_id" uuid,
	"staff_device_id" uuid,
	"pin_session" boolean DEFAULT false NOT NULL,
	"two_factor_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"registered_by_user_id" uuid,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_devices_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "staff_devices_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"thumbhash" text,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"original_filename" text,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assets_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "assets_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "assets_status_check" CHECK ("assets"."status" in ('pending', 'ready', 'failed')),
	CONSTRAINT "assets_bytes_check" CHECK ("assets"."bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "exchange_rate_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"lbp_rate" integer NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"set_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rate_history_lbp_rate_check" CHECK ("exchange_rate_history"."lbp_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"term" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_faq" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"question" jsonb NOT NULL,
	"answer" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" "citext" NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"address" jsonb,
	"city" text,
	"phone" text,
	"whatsapp_number" text,
	"instagram_handle" text,
	"logo_asset_id" uuid,
	"cover_asset_id" uuid,
	"theme" jsonb DEFAULT '{"preset":"zaatar"}'::jsonb NOT NULL,
	"timezone" text DEFAULT 'Asia/Beirut' NOT NULL,
	"default_locale" "locale" DEFAULT 'en' NOT NULL,
	"enabled_locales" "locale"[] DEFAULT '{"en","ar"}' NOT NULL,
	"base_currency" "currency" DEFAULT 'USD' NOT NULL,
	"show_secondary_currency" boolean DEFAULT true NOT NULL,
	"lbp_rate" integer DEFAULT 89500 NOT NULL,
	"lbp_rounding_step" integer DEFAULT 5000 NOT NULL,
	"lbp_rounding_mode" text DEFAULT 'nearest' NOT NULL,
	"tax_rate_bps" integer DEFAULT 1100 NOT NULL,
	"tax_inclusive" boolean DEFAULT true NOT NULL,
	"tax_applies_to_service" boolean DEFAULT true NOT NULL,
	"service_charge_bps" integer DEFAULT 0 NOT NULL,
	"service_charge_label" jsonb,
	"ordering_mode" "ordering_mode" DEFAULT 'browse_only' NOT NULL,
	"group_ordering_enabled" boolean DEFAULT true NOT NULL,
	"require_staff_approval" boolean DEFAULT true NOT NULL,
	"lock_new_joiners_default" boolean DEFAULT false NOT NULL,
	"ai_assistant_enabled" boolean DEFAULT true NOT NULL,
	"ai_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"opening_hours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "restaurant_status" DEFAULT 'draft' NOT NULL,
	"published_menu_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "restaurants_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "restaurants_slug_check" CHECK ("restaurants"."slug" ~ '^[a-z0-9-]{3,48}$'),
	CONSTRAINT "restaurants_lbp_rate_check" CHECK ("restaurants"."lbp_rate" > 0),
	CONSTRAINT "restaurants_lbp_rounding_step_check" CHECK ("restaurants"."lbp_rounding_step" >= 0),
	CONSTRAINT "restaurants_lbp_rounding_mode_check" CHECK ("restaurants"."lbp_rounding_mode" in ('nearest', 'up')),
	CONSTRAINT "restaurants_tax_rate_check" CHECK ("restaurants"."tax_rate_bps" between 0 and 10000),
	CONSTRAINT "restaurants_service_charge_check" CHECK ("restaurants"."service_charge_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "kitchen_stations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kitchen_stations_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"position" integer NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"availability_schedule" jsonb,
	"kitchen_station_id" uuid,
	"translation_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "menu_categories_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "menu_item_allergens" (
	"item_id" uuid NOT NULL,
	"allergen" "allergen_code" NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"status" "allergen_status" DEFAULT 'unknown' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" uuid,
	"suggested_status" "allergen_status",
	"suggestion_source" "suggestion_source",
	"suggestion_reason" text,
	"suggestion_confidence" real,
	"notes" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_allergens_pk" PRIMARY KEY("item_id","allergen")
);
--> statement-breakpoint
CREATE TABLE "menu_item_ingredients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_key" boolean DEFAULT true NOT NULL,
	"is_removable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_ingredients_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "menu_item_modifier_groups" (
	"item_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_item_modifier_groups_pk" PRIMARY KEY("item_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "menu_item_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"price_minor" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "menu_item_variants_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "menu_item_variants_price_check" CHECK ("menu_item_variants"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"position" integer NOT NULL,
	"base_price_minor" integer NOT NULL,
	"image_asset_id" uuid,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"availability_schedule" jsonb,
	"spice_level" smallint,
	"calories" integer,
	"diet_tags" "diet_tag"[] DEFAULT '{}' NOT NULL,
	"item_tags" "item_tag"[] DEFAULT '{}' NOT NULL,
	"prep_minutes" smallint,
	"kitchen_station_id" uuid,
	"translation_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allergens_confirmed_at" timestamp with time zone,
	"allergens_confirmed_by" uuid,
	"allergens_need_review" boolean DEFAULT true NOT NULL,
	"search_text" text GENERATED ALWAYS AS (lower(f_unaccent(coalesce(name->>'ar', '') || ' ' || coalesce(name->>'en', '') || ' ' || coalesce(name->>'fr', '')))) STORED,
	"source_import_job_id" uuid,
	"content_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "menu_items_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "menu_items_base_price_check" CHECK ("menu_items"."base_price_minor" >= 0),
	CONSTRAINT "menu_items_spice_level_check" CHECK ("menu_items"."spice_level" between 0 and 3),
	CONSTRAINT "menu_items_calories_check" CHECK ("menu_items"."calories" >= 0),
	CONSTRAINT "menu_items_prep_minutes_check" CHECK ("menu_items"."prep_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"ai_context_text" text NOT NULL,
	"ai_context_tokens" integer,
	"stats" jsonb NOT NULL,
	"published_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "menu_versions_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "menu_versions_restaurant_version_uq" UNIQUE("restaurant_id","version"),
	CONSTRAINT "menu_versions_version_check" CHECK ("menu_versions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"min_select" smallint DEFAULT 0 NOT NULL,
	"max_select" smallint DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "modifier_groups_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "modifier_groups_select_check" CHECK ("modifier_groups"."min_select" >= 0 and "modifier_groups"."max_select" >= "modifier_groups"."min_select" and "modifier_groups"."max_select" >= 1)
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"price_delta_minor" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"adds_allergens" "allergen_code"[] DEFAULT '{}' NOT NULL,
	"adds_allergens_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "modifier_options_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "dining_areas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "dining_areas_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"area_id" uuid,
	"label" text NOT NULL,
	"seats" smallint,
	"qr_token" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "dining_tables_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "dining_tables_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "dining_tables_seats_check" CHECK ("dining_tables"."seats" > 0),
	CONSTRAINT "dining_tables_qr_token_check" CHECK (char_length("dining_tables"."qr_token") = 12)
);
--> statement-breakpoint
CREATE TABLE "diner_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"preferred_locale" "locale",
	"last_display_name" text,
	"ua_hash" text
);
--> statement-breakpoint
CREATE TABLE "order_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "round_status" NOT NULL,
	"submitted_by_participant_id" uuid,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"rejection_reason" text,
	"kitchen_note" text,
	CONSTRAINT "order_rounds_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "order_rounds_session_number_uq" UNIQUE("session_id","number"),
	CONSTRAINT "order_rounds_number_check" CHECK ("order_rounds"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "session_item_shares" (
	"session_item_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"weight" smallint DEFAULT 1 NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_item_shares_pk" PRIMARY KEY("session_item_id","participant_id"),
	CONSTRAINT "session_item_shares_weight_check" CHECK ("session_item_shares"."weight" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "session_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"round_id" uuid,
	"menu_item_id" uuid NOT NULL,
	"variant_id" uuid,
	"quantity" smallint NOT NULL,
	"option_ids" uuid[] DEFAULT '{}' NOT NULL,
	"removed_ingredient_ids" uuid[] DEFAULT '{}' NOT NULL,
	"note" text,
	"unit_price_minor" integer NOT NULL,
	"options_price_minor" integer DEFAULT 0 NOT NULL,
	"line_total_minor" integer NOT NULL,
	"name_snapshot" jsonb NOT NULL,
	"options_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "session_item_status" DEFAULT 'draft' NOT NULL,
	"status_changed_at" timestamp with time zone,
	"voided_reason" text,
	"voided_by_user_id" uuid,
	"added_by_user_id" uuid,
	"client_mutation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_items_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "session_items_quantity_check" CHECK ("session_items"."quantity" between 1 and 20),
	CONSTRAINT "session_items_note_check" CHECK (char_length("session_items"."note") <= 140),
	CONSTRAINT "session_items_unit_price_check" CHECK ("session_items"."unit_price_minor" >= 0),
	CONSTRAINT "session_items_line_total_check" CHECK ("session_items"."line_total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "session_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"device_id" uuid,
	"display_name" text NOT NULL,
	"color" text NOT NULL,
	"emoji" text,
	"role" "participant_role" DEFAULT 'guest' NOT NULL,
	"status" "participant_status" DEFAULT 'active' NOT NULL,
	"is_ready" boolean DEFAULT false NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"created_by_staff_user_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "session_participants_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "session_participants_display_name_check" CHECK (char_length("session_participants"."display_name") between 1 and 24)
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"host_participant_id" uuid,
	"is_locked" boolean DEFAULT false NOT NULL,
	"ordering_mode_snapshot" "ordering_mode" NOT NULL,
	"lbp_rate_snapshot" integer,
	"split_mode" "split_mode" DEFAULT 'by_person' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bill_requested_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"close_reason" text,
	"force_closed" boolean DEFAULT false NOT NULL,
	"feedback" jsonb,
	"merged_into_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_sessions_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "table_sessions_version_check" CHECK ("table_sessions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "waiter_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" uuid,
	"type" "waiter_call_type" NOT NULL,
	"status" "waiter_call_status" DEFAULT 'open' NOT NULL,
	"note" text,
	"acknowledged_by_user_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waiter_calls_note_check" CHECK (char_length("waiter_calls"."note") <= 140)
);
--> statement-breakpoint
CREATE TABLE "bill_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"lbp_rate" integer NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bill_snapshots_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"scope" "discount_scope" NOT NULL,
	"target_id" uuid,
	"type" "discount_type" NOT NULL,
	"value" integer NOT NULL,
	"reason" text NOT NULL,
	"applied_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	CONSTRAINT "discounts_value_check" CHECK ("discounts"."value" > 0),
	CONSTRAINT "discounts_percent_check" CHECK ("discounts"."type" <> 'percent' or "discounts"."value" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_minor" integer NOT NULL,
	"allocations" jsonb NOT NULL,
	"tip_minor" integer DEFAULT 0 NOT NULL,
	"tendered" jsonb,
	"change_given" jsonb,
	"lbp_rate_used" integer,
	"payer_participant_id" uuid,
	"external_reference" text,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" text,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_minor" > 0),
	CONSTRAINT "payments_tip_check" CHECK ("payments"."tip_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid,
	"participant_id" uuid,
	"device_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"menu_version_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	CONSTRAINT "chat_conversations_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "chat_message_labels" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"intent" "chat_intent" NOT NULL,
	"dish_ids" uuid[] DEFAULT '{}' NOT NULL,
	"allergens" "allergen_code"[] DEFAULT '{}' NOT NULL,
	"diets" "diet_tag"[] DEFAULT '{}' NOT NULL,
	"answer_status" "answer_status" NOT NULL,
	"topic_key" text,
	"model" text,
	"classified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"ui_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safety" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"cost_micros" integer,
	"latency_first_token_ms" integer,
	"latency_total_ms" integer,
	"feedback" smallint,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "import_job_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"import_job_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"page_index" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"error" jsonb,
	"model" text,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_job_pages_job_asset_page_uq" UNIQUE("import_job_id","asset_id","page_index")
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"status" "import_status" DEFAULT 'queued' NOT NULL,
	"source_asset_ids" uuid[] NOT NULL,
	"options" jsonb NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft" jsonb,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" jsonb,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "import_jobs_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "daily_dish_metrics" (
	"restaurant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"dish_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"adds" integer DEFAULT 0 NOT NULL,
	"ordered_qty" integer DEFAULT 0 NOT NULL,
	"chat_mentions" integer DEFAULT 0 NOT NULL,
	"recommended" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_dish_metrics_pk" PRIMARY KEY("restaurant_id","day","dish_id")
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"restaurant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"organization_id" uuid NOT NULL,
	"scans" integer DEFAULT 0 NOT NULL,
	"unique_devices" integer DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"group_sessions" integer DEFAULT 0 NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"items_ordered" integer DEFAULT 0 NOT NULL,
	"revenue_minor" bigint DEFAULT 0 NOT NULL,
	"avg_participants" numeric(4, 2),
	"chat_conversations" integer DEFAULT 0 NOT NULL,
	"chat_messages" integer DEFAULT 0 NOT NULL,
	"waiter_calls" integer DEFAULT 0 NOT NULL,
	"ai_cost_micros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_metrics_pk" PRIMARY KEY("restaurant_id","day")
);
--> statement-breakpoint
CREATE TABLE "insight_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"metrics" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"model" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_events" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "menu_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid,
	"device_id" uuid,
	"type" text NOT NULL,
	"dish_id" uuid,
	"category_id" uuid,
	"payload" jsonb,
	"locale" "locale",
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "menu_events_pk" PRIMARY KEY("id","occurred_at")
) PARTITION BY RANGE ("occurred_at"); -- added by hand: Drizzle cannot express partitioning
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid,
	"restaurant_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"organization_id" uuid,
	"enabled" boolean NOT NULL,
	CONSTRAINT "feature_flags_key_org_uq" UNIQUE NULLS NOT DISTINCT("key","organization_id")
);
--> statement-breakpoint
CREATE TABLE "notification_optins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"address" text NOT NULL,
	"verified_at" timestamp with time zone,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "notification_optins_channel_check" CHECK ("notification_optins"."channel" in ('email', 'whatsapp'))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"room" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" "currency" NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "subscription_payments_amount_check" CHECK ("subscription_payments"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"plan" "plan_code" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_start" date NOT NULL,
	"current_period_end" date NOT NULL,
	"grace_until" date,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"organization_id" uuid NOT NULL,
	"period" text NOT NULL,
	"ai_conversations" integer DEFAULT 0 NOT NULL,
	"ai_messages" integer DEFAULT 0 NOT NULL,
	"ai_cost_micros" bigint DEFAULT 0 NOT NULL,
	"import_pages" integer DEFAULT 0 NOT NULL,
	"whatsapp_messages" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_pk" PRIMARY KEY("organization_id","period"),
	CONSTRAINT "usage_counters_period_check" CHECK ("usage_counters"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_staff_device_id_staff_devices_id_fk" FOREIGN KEY ("staff_device_id") REFERENCES "public"."staff_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_devices" ADD CONSTRAINT "staff_devices_registered_by_user_id_user_id_fk" FOREIGN KEY ("registered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_devices" ADD CONSTRAINT "staff_devices_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_history" ADD CONSTRAINT "exchange_rate_history_set_by_user_id_user_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_history" ADD CONSTRAINT "exchange_rate_history_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_faq" ADD CONSTRAINT "restaurant_faq_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_logo_asset_fk" FOREIGN KEY ("organization_id","logo_asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_cover_asset_fk" FOREIGN KEY ("organization_id","cover_asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_published_version_fk" FOREIGN KEY ("organization_id","published_menu_version_id") REFERENCES "public"."menu_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_station_fk" FOREIGN KEY ("organization_id","kitchen_station_id") REFERENCES "public"."kitchen_stations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_allergens" ADD CONSTRAINT "menu_item_allergens_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_allergens" ADD CONSTRAINT "menu_item_allergens_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_allergens" ADD CONSTRAINT "menu_item_allergens_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."menu_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."menu_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."menu_items"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_group_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."modifier_groups"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."menu_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_allergens_confirmed_by_user_id_fk" FOREIGN KEY ("allergens_confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_fk" FOREIGN KEY ("organization_id","category_id") REFERENCES "public"."menu_categories"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_image_asset_fk" FOREIGN KEY ("organization_id","image_asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_station_fk" FOREIGN KEY ("organization_id","kitchen_station_id") REFERENCES "public"."kitchen_stations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_import_job_fk" FOREIGN KEY ("organization_id","source_import_job_id") REFERENCES "public"."import_jobs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_versions" ADD CONSTRAINT "menu_versions_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_versions" ADD CONSTRAINT "menu_versions_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."modifier_groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_area_fk" FOREIGN KEY ("organization_id","area_id") REFERENCES "public"."dining_areas"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_rounds" ADD CONSTRAINT "order_rounds_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_rounds" ADD CONSTRAINT "order_rounds_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_rounds" ADD CONSTRAINT "order_rounds_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_rounds" ADD CONSTRAINT "order_rounds_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."table_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_rounds" ADD CONSTRAINT "order_rounds_submitter_fk" FOREIGN KEY ("organization_id","submitted_by_participant_id") REFERENCES "public"."session_participants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_item_shares" ADD CONSTRAINT "session_item_shares_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_item_shares" ADD CONSTRAINT "session_item_shares_item_fk" FOREIGN KEY ("organization_id","session_item_id") REFERENCES "public"."session_items"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_item_shares" ADD CONSTRAINT "session_item_shares_participant_fk" FOREIGN KEY ("organization_id","participant_id") REFERENCES "public"."session_participants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_voided_by_user_id_user_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."table_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_participant_fk" FOREIGN KEY ("organization_id","participant_id") REFERENCES "public"."session_participants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_round_fk" FOREIGN KEY ("organization_id","round_id") REFERENCES "public"."order_rounds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_menu_item_fk" FOREIGN KEY ("organization_id","menu_item_id") REFERENCES "public"."menu_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_variant_fk" FOREIGN KEY ("organization_id","variant_id") REFERENCES "public"."menu_item_variants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_device_id_diner_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."diner_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_created_by_staff_user_id_user_id_fk" FOREIGN KEY ("created_by_staff_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."table_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_fk" FOREIGN KEY ("organization_id","table_id") REFERENCES "public"."dining_tables"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_host_fk" FOREIGN KEY ("organization_id","host_participant_id") REFERENCES "public"."session_participants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_merged_into_fk" FOREIGN KEY ("organization_id","merged_into_session_id") REFERENCES "public"."table_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_acknowledged_by_user_id_user_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."table_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_participant_fk" FOREIGN KEY ("organization_id","participant_id") REFERENCES "public"."session_participants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_snapshots" ADD CONSTRAINT "bill_snapshots_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_snapshots" ADD CONSTRAINT "bill_snapshots_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."table_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_applied_by_user_id_user_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."table_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_user_id_user_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."table_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_fk" FOREIGN KEY ("organization_id","payer_participant_id") REFERENCES "public"."session_participants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_device_id_diner_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."diner_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."table_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_participant_fk" FOREIGN KEY ("organization_id","participant_id") REFERENCES "public"."session_participants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_menu_version_fk" FOREIGN KEY ("organization_id","menu_version_id") REFERENCES "public"."menu_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_labels" ADD CONSTRAINT "chat_message_labels_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_labels" ADD CONSTRAINT "chat_message_labels_message_fk" FOREIGN KEY ("organization_id","message_id") REFERENCES "public"."chat_messages"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."chat_conversations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_pages" ADD CONSTRAINT "import_job_pages_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_pages" ADD CONSTRAINT "import_job_pages_job_fk" FOREIGN KEY ("organization_id","import_job_id") REFERENCES "public"."import_jobs"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_pages" ADD CONSTRAINT "import_job_pages_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_dish_metrics" ADD CONSTRAINT "daily_dish_metrics_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_reports" ADD CONSTRAINT "insight_reports_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_events" ADD CONSTRAINT "menu_events_restaurant_fk" FOREIGN KEY ("organization_id","restaurant_id") REFERENCES "public"."restaurants"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_optins" ADD CONSTRAINT "notification_optins_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_optins" ADD CONSTRAINT "notification_optins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitation_inviter_id_idx" ON "invitation" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_staff_device_id_idx" ON "session" USING btree ("staff_device_id");--> statement-breakpoint
CREATE INDEX "staff_devices_restaurant_id_idx" ON "staff_devices" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "assets_organization_id_idx" ON "assets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "exchange_rate_history_restaurant_effective_idx" ON "exchange_rate_history" USING btree ("restaurant_id","effective_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "glossary_terms_restaurant_id_idx" ON "glossary_terms" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "restaurant_faq_restaurant_position_idx" ON "restaurant_faq" USING btree ("restaurant_id","position");--> statement-breakpoint
CREATE INDEX "restaurants_organization_id_idx" ON "restaurants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "restaurants_published_menu_version_id_idx" ON "restaurants" USING btree ("published_menu_version_id");--> statement-breakpoint
CREATE INDEX "kitchen_stations_restaurant_id_idx" ON "kitchen_stations" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "menu_categories_restaurant_position_idx" ON "menu_categories" USING btree ("restaurant_id","position");--> statement-breakpoint
CREATE INDEX "menu_categories_kitchen_station_id_idx" ON "menu_categories" USING btree ("kitchen_station_id");--> statement-breakpoint
CREATE INDEX "menu_item_allergens_restaurant_id_idx" ON "menu_item_allergens" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "menu_item_ingredients_item_id_idx" ON "menu_item_ingredients" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "menu_item_modifier_groups_group_id_idx" ON "menu_item_modifier_groups" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "menu_item_variants_item_id_idx" ON "menu_item_variants" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "menu_items_restaurant_category_position_idx" ON "menu_items" USING btree ("restaurant_id","category_id","position");--> statement-breakpoint
CREATE INDEX "menu_items_category_id_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "menu_items_image_asset_id_idx" ON "menu_items" USING btree ("image_asset_id");--> statement-breakpoint
CREATE INDEX "menu_items_kitchen_station_id_idx" ON "menu_items" USING btree ("kitchen_station_id");--> statement-breakpoint
CREATE INDEX "menu_items_source_import_job_id_idx" ON "menu_items" USING btree ("source_import_job_id");--> statement-breakpoint
CREATE INDEX "menu_items_search_text_trgm_idx" ON "menu_items" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "modifier_groups_restaurant_id_idx" ON "modifier_groups" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "modifier_options_group_id_idx" ON "modifier_options" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "dining_areas_restaurant_id_idx" ON "dining_areas" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "dining_tables_area_id_idx" ON "dining_tables" USING btree ("area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_restaurant_label_uq" ON "dining_tables" USING btree ("restaurant_id","label") WHERE "dining_tables"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "order_rounds_submitted_by_participant_id_idx" ON "order_rounds" USING btree ("submitted_by_participant_id");--> statement-breakpoint
CREATE INDEX "session_item_shares_participant_id_idx" ON "session_item_shares" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "session_items_session_status_idx" ON "session_items" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "session_items_kitchen_idx" ON "session_items" USING btree ("restaurant_id","status") WHERE "session_items"."status" in ('accepted', 'preparing', 'ready');--> statement-breakpoint
CREATE INDEX "session_items_participant_id_idx" ON "session_items" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "session_items_round_id_idx" ON "session_items" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "session_items_menu_item_id_idx" ON "session_items" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "session_items_variant_id_idx" ON "session_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_participants_session_device_uq" ON "session_participants" USING btree ("session_id","device_id") WHERE "session_participants"."device_id" is not null;--> statement-breakpoint
CREATE INDEX "session_participants_session_id_idx" ON "session_participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_participants_device_id_idx" ON "session_participants" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_live_table_uq" ON "table_sessions" USING btree ("table_id") WHERE "table_sessions"."status" in ('open', 'bill_requested');--> statement-breakpoint
CREATE INDEX "table_sessions_restaurant_status_idx" ON "table_sessions" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "table_sessions_table_id_idx" ON "table_sessions" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "table_sessions_host_participant_id_idx" ON "table_sessions" USING btree ("host_participant_id");--> statement-breakpoint
CREATE INDEX "table_sessions_merged_into_session_id_idx" ON "table_sessions" USING btree ("merged_into_session_id");--> statement-breakpoint
CREATE INDEX "waiter_calls_restaurant_status_idx" ON "waiter_calls" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "waiter_calls_session_id_idx" ON "waiter_calls" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "waiter_calls_participant_id_idx" ON "waiter_calls" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "bill_snapshots_restaurant_id_idx" ON "bill_snapshots" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "discounts_session_id_idx" ON "discounts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "payments_session_id_idx" ON "payments" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "payments_restaurant_recorded_at_idx" ON "payments" USING btree ("restaurant_id","recorded_at");--> statement-breakpoint
CREATE INDEX "payments_payer_participant_id_idx" ON "payments" USING btree ("payer_participant_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_restaurant_started_idx" ON "chat_conversations" USING btree ("restaurant_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_conversations_session_id_idx" ON "chat_conversations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_participant_id_idx" ON "chat_conversations" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_device_id_idx" ON "chat_conversations" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_menu_version_id_idx" ON "chat_conversations" USING btree ("menu_version_id");--> statement-breakpoint
CREATE INDEX "chat_message_labels_restaurant_classified_idx" ON "chat_message_labels" USING btree ("restaurant_id","classified_at");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_created_idx" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "import_job_pages_asset_id_idx" ON "import_job_pages" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "import_jobs_restaurant_id_idx" ON "import_jobs" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "insight_reports_restaurant_period_idx" ON "insight_reports" USING btree ("restaurant_id","period_start");--> statement-breakpoint
CREATE INDEX "menu_events_restaurant_occurred_idx" ON "menu_events" USING btree ("restaurant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_organization_created_idx" ON "audit_logs" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "notification_optins_organization_id_idx" ON "notification_optins" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_optins_user_id_idx" ON "notification_optins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outbox_events_undispatched_idx" ON "outbox_events" USING btree ("created_at") WHERE "outbox_events"."dispatched_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_events_organization_id_idx" ON "outbox_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscription_payments_organization_id_idx" ON "subscription_payments" USING btree ("organization_id");