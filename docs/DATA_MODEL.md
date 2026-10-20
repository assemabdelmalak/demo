# DATA MODEL — Radd Menu (PostgreSQL 17, Drizzle ORM)

## 0. Conventions

- **Primary keys.** `id uuid` holding a UUIDv7 generated in the app, unless noted.
- **Timestamps.** `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. A trigger or an app-side hook updates `updated_at`.
- **Soft delete.** `deleted_at timestamptz null` where noted. Default queries exclude deleted rows.
- **Tenant columns.** Every tenant table has `organization_id uuid not null` and `restaurant_id uuid` where restaurant-scoped. RLS is enabled on all of them.
- **Money.**
  - `*_minor integer`: minor units of the restaurant's **base currency**. USD → cents. LBP → whole pounds.
  - Use `bigint` for any aggregate.
  - Currency codes: `'USD' | 'LBP'`.
- **Localized text.** `LocalizedText` is JSONB `{ "ar"?: string, "en"?: string, "fr"?: string }`, validated by zod: at least one key, each value trimmed and 1..N characters.
- **Enums.** Defined as Postgres enums via Drizzle `pgEnum`, and mirrored in `packages/shared/enums.ts`.
- **Naming.** Every foreign key is indexed. Composite indexes are listed below.
- **Extensions.** `pg_trgm`, `unaccent`, `citext`. (`vector` is installed but not used in v1.)

---

## 1. Enums

```
locale                : 'ar' | 'en' | 'fr'
currency              : 'USD' | 'LBP'
member_role           : 'owner' | 'manager' | 'staff' | 'kitchen'
restaurant_status     : 'draft' | 'live' | 'suspended'
ordering_mode         : 'browse_only' | 'staff_entry' | 'diner_with_approval' | 'diner_direct'
allergen_code         : 'gluten' | 'crustaceans' | 'eggs' | 'fish' | 'peanuts' | 'soybeans' | 'milk'
                        | 'tree_nuts' | 'celery' | 'mustard' | 'sesame' | 'sulphites' | 'lupin' | 'molluscs'
allergen_status       : 'contains' | 'may_contain' | 'free' | 'unknown'
suggestion_source     : 'ai' | 'import_text' | 'owner'
diet_tag              : 'vegetarian' | 'vegan' | 'pescatarian' | 'halal' | 'alcohol' | 'contains_pork'
item_tag              : 'new' | 'chef_pick' | 'popular' | 'signature' | 'seasonal'
asset_kind            : 'image' | 'pdf' | 'spreadsheet' | 'export' | 'other'
import_status         : 'queued' | 'processing' | 'needs_review' | 'applying' | 'applied' | 'failed' | 'cancelled'
session_status        : 'open' | 'bill_requested' | 'closed' | 'abandoned'
participant_role      : 'host' | 'guest'
participant_status    : 'active' | 'left' | 'removed' | 'pending_approval'
session_item_status   : 'draft' | 'pending_approval' | 'accepted' | 'preparing' | 'ready' | 'served'
                        | 'rejected' | 'voided' | 'removed'
round_status          : 'pending_approval' | 'accepted' | 'partially_accepted' | 'rejected'
waiter_call_type      : 'call_waiter' | 'request_bill' | 'water' | 'allergy_help' | 'other'
waiter_call_status    : 'open' | 'acknowledged' | 'resolved' | 'cancelled'
payment_method        : 'cash_usd' | 'cash_lbp' | 'card' | 'whish' | 'omt' | 'bank_transfer' | 'other'
discount_scope        : 'item' | 'participant' | 'bill'
discount_type         : 'percent' | 'amount'
split_mode            : 'by_person' | 'equal' | 'custom'
chat_role             : 'user' | 'assistant'
chat_intent           : 'ingredients' | 'allergen' | 'diet' | 'recommendation' | 'price' | 'substitution'
                        | 'availability' | 'restaurant_info' | 'ordering_help' | 'off_topic' | 'other'
answer_status         : 'answered' | 'deferred_to_staff' | 'data_missing' | 'refused' | 'error'
plan_code             : 'free' | 'pro' | 'bundle'
subscription_status   : 'active' | 'grace' | 'expired' | 'suspended'
actor_type            : 'user' | 'staff_device' | 'diner' | 'system' | 'super_admin'
```

---

## 2. Auth and organisation

### Better Auth core tables

Better Auth generates `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`. Keep its generated schema and extend it through its `additionalFields` support. These tables are global; they have no RLS.

**`organization` additional fields:**
- `country text default 'LB'`
- `plan plan_code not null default 'free'`
- `status text not null default 'active'` (`active` | `suspended`)
- `terms_version_accepted text`
- `terms_accepted_at timestamptz`

**`member` additional fields:**
- `pin_hash text null` (argon2id). Used for staff quick-switch on shared devices.
- `display_name text null`

`member.role` uses the `member_role` values.

### `staff_devices`

Shared tablets registered by a manager.

```
id, organization_id, restaurant_id, name text, token_hash text unique, registered_by_user_id,
last_seen_at, revoked_at, created_at
```

---

## 3. Restaurants

### `restaurants`

```
id                         uuid pk
organization_id            uuid not null → organization.id
slug                       citext unique not null            -- [a-z0-9-]{3,48}
name                       jsonb LocalizedText not null
description                jsonb LocalizedText null
address                    jsonb LocalizedText null
city                       text null
phone                      text null
whatsapp_number            text null                         -- E.164
instagram_handle           text null
logo_asset_id              uuid null → assets.id
cover_asset_id             uuid null → assets.id
theme                      jsonb not null default '{"preset":"zaatar"}'
                           -- { preset, primaryColor?, fontPair?, cornerStyle?: 'soft'|'sharp', dark?: boolean }
timezone                   text not null default 'Asia/Beirut'
default_locale             locale not null default 'en'      -- ADR-009
enabled_locales            locale[] not null default '{en,ar}'
base_currency              currency not null default 'USD'
show_secondary_currency    boolean not null default true    -- LBP when base is USD (and vice versa)
lbp_rate                   integer not null default 89500    -- LBP per 1 USD
lbp_rounding_step          integer not null default 5000     -- 0 = no rounding; e.g. 1000, 5000, 10000
lbp_rounding_mode          text not null default 'nearest'   -- 'nearest' | 'up'
tax_rate_bps               integer not null default 1100     -- 11.00%
tax_inclusive              boolean not null default true
tax_applies_to_service     boolean not null default true
service_charge_bps         integer not null default 0
service_charge_label       jsonb LocalizedText null
ordering_mode              ordering_mode not null default 'browse_only'
group_ordering_enabled     boolean not null default true
require_staff_approval     boolean not null default true
lock_new_joiners_default   boolean not null default false
ai_assistant_enabled       boolean not null default true
ai_settings                jsonb not null default '{}'
                           -- { assistantName?: LocalizedText, tone: 'friendly'|'formal', upsell: boolean,
                           --   showDisclaimerAlways: true }
opening_hours              jsonb not null default '[]'
                           -- [{ day: 0-6, open: "12:00", close: "23:30" }], close < open means past midnight
status                     restaurant_status not null default 'draft'
published_menu_version_id  uuid null → menu_versions.id
created_at, updated_at, deleted_at
INDEX (organization_id)
```

### `exchange_rate_history`

```
id, organization_id, restaurant_id, lbp_rate integer not null, effective_at timestamptz not null,
set_by_user_id, created_at
INDEX (restaurant_id, effective_at desc)
```

### `restaurant_faq`

Owner-provided facts the assistant may use.

```
id, organization_id, restaurant_id, question jsonb LocalizedText, answer jsonb LocalizedText,
position int, is_active boolean default true, created_at, updated_at
```

### `glossary_terms`

Translation glossary.

```
id, organization_id, restaurant_id, term jsonb LocalizedText, notes text, created_at
```

---

## 4. Assets

### `assets`

```
id, organization_id, kind asset_kind, bucket text, storage_key text unique, mime text, bytes integer,
width integer null, height integer null, thumbhash text null,
variants jsonb not null default '[]'   -- [{ format:'avif'|'webp', width, key, bytes }]
status text not null default 'pending' -- pending | ready | failed
original_filename text, uploaded_by_user_id, created_at, deleted_at
```

---

## 5. Menu

### `kitchen_stations`

```
id, organization_id, restaurant_id, name jsonb LocalizedText, position int, created_at
```

### `menu_categories`

```
id, organization_id, restaurant_id, name jsonb LocalizedText not null, description jsonb null,
position integer not null, is_visible boolean default true,
availability_schedule jsonb null      -- null = always; [{ days:[0..6], from:"07:00", to:"11:30" }]
kitchen_station_id uuid null, translation_meta jsonb default '{}',
created_at, updated_at, deleted_at
INDEX (restaurant_id, position)
```

### `menu_items`

```
id                      uuid pk
organization_id, restaurant_id
category_id             uuid not null → menu_categories.id
name                    jsonb LocalizedText not null
description             jsonb LocalizedText null
position                integer not null
base_price_minor        integer not null check (>= 0)   -- used when no variants
image_asset_id          uuid null
is_available            boolean not null default true   -- "86" toggle
is_visible              boolean not null default true
availability_schedule   jsonb null
spice_level             smallint null check (0..3)
calories                integer null
diet_tags               diet_tag[] not null default '{}'
item_tags               item_tag[] not null default '{}'
prep_minutes            smallint null
kitchen_station_id      uuid null
translation_meta        jsonb default '{}'              -- { name:{ar:'owner',en:'machine'}, ... }
allergens_confirmed_at  timestamptz null   -- denormalised: all 14 explicitly set & confirmed
allergens_confirmed_by  uuid null
allergens_need_review   boolean not null default true   -- true when invalidated by changes
search_text             text generated always as (lower(unaccent(coalesce(name->>'ar','')||' '||coalesce(name->>'en','')||' '||coalesce(name->>'fr','')))) stored
source_import_job_id    uuid null
content_version         integer not null default 1      -- bump on any diner-visible change
created_at, updated_at, deleted_at
INDEX (restaurant_id, category_id, position)
INDEX gin (search_text gin_trgm_ops)
```

> **Note.** Postgres requires functions in generated columns to be IMMUTABLE. `unaccent` is not. Wrap it in an immutable SQL function `f_unaccent(text)`, or compute `search_text` in the app on write.

### `menu_item_variants`

Sizes and portions.

```
id, organization_id, restaurant_id, item_id → menu_items.id,
name jsonb LocalizedText not null, price_minor integer not null check (>=0),
position int, is_default boolean default false, created_at, updated_at, deleted_at
```

Rule: if an item has variants, the diner must pick one (the default is preselected) and `base_price_minor` is ignored.

### `menu_item_ingredients`

```
id, organization_id, restaurant_id, item_id, name jsonb LocalizedText not null,
position int, is_key boolean default true,       -- shown on dish page
is_removable boolean default false,              -- "no onions" allowed as a free modification
created_at, updated_at
```

### `menu_item_allergens`

The core of allergen safety.

```
item_id              uuid → menu_items.id
allergen             allergen_code
organization_id, restaurant_id
status               allergen_status not null default 'unknown'   -- the OWNER-SET status
confirmed_at         timestamptz null      -- set when owner confirms (null ⇒ diners see 'unknown')
confirmed_by_user_id uuid null
suggested_status     allergen_status null  -- AI / import suggestion, never shown to diners
suggestion_source    suggestion_source null
suggestion_reason    text null             -- short evidence, e.g. "tahini (sesame) in description"
suggestion_confidence real null
notes                jsonb LocalizedText null  -- optional owner note shown to diners
updated_at
PRIMARY KEY (item_id, allergen)
```

**Invariant (enforced in service and tested):** what diners see is computed as

```
diner_status = (confirmed_at IS NOT NULL) ? status : 'unknown'
```

### `modifier_groups`

```
id, organization_id, restaurant_id, name jsonb LocalizedText, min_select smallint default 0,
max_select smallint default 1, position int, created_at, updated_at, deleted_at
CHECK (max_select >= min_select AND max_select >= 1)
```

### `modifier_options`

```
id, organization_id, restaurant_id, group_id → modifier_groups.id, name jsonb LocalizedText,
price_delta_minor integer not null default 0, is_default boolean default false,
is_available boolean default true, position int,
adds_allergens allergen_code[] not null default '{}',   -- e.g. "add halloumi" adds milk
adds_allergens_confirmed_at timestamptz null,           -- unconfirmed ⇒ treat option as "unknown impact"
created_at, updated_at, deleted_at
```

### `menu_item_modifier_groups`

```
item_id, group_id, position, PRIMARY KEY (item_id, group_id)
```

### `menu_versions`

Published, immutable snapshots.

```
id, organization_id, restaurant_id, version integer not null,
snapshot jsonb not null,              -- see §10
snapshot_hash text not null,          -- sha256 of canonical JSON
ai_context_text text not null,        -- compact text for LLM (see AI_ARCHITECTURE.md §4)
ai_context_tokens integer null,
stats jsonb not null,                 -- { items, categories, unconfirmedAllergenItems, missingTranslations }
published_by_user_id, published_at timestamptz not null
UNIQUE (restaurant_id, version)
```

RLS allows public read of rows referenced by `restaurants.published_menu_version_id` via the public repository role.

---

## 6. Tables and QR

### `dining_areas`

```
id, organization_id, restaurant_id, name jsonb LocalizedText, position int, created_at, deleted_at
```

### `dining_tables`

```
id, organization_id, restaurant_id, area_id null, label text not null,   -- "12", "T3", "Bar 2"
seats smallint null, qr_token text unique not null,  -- base58, 12 chars, random (not sequential)
is_active boolean default true, position int, created_at, updated_at, deleted_at
UNIQUE (restaurant_id, label) WHERE deleted_at IS NULL
```

---

## 7. Sessions, participants, items, rounds

### `diner_devices`

```
id uuid pk (value stored in signed cookie), first_seen_at, last_seen_at,
preferred_locale locale null, last_display_name text null, ua_hash text null
```

This table is global and holds no PII.

### `table_sessions`

```
id, organization_id, restaurant_id, table_id → dining_tables.id,
status session_status not null default 'open',
version integer not null default 1,           -- bump on EVERY change in this session
host_participant_id uuid null,
is_locked boolean not null default false,     -- new joiners need host/staff approval
ordering_mode_snapshot ordering_mode not null,
lbp_rate_snapshot integer null,               -- locked when bill requested
split_mode split_mode not null default 'by_person',
opened_at timestamptz not null default now(), bill_requested_at null, closed_at null,
closed_by_user_id null, close_reason text null, force_closed boolean default false,
feedback jsonb null,                          -- [{participantId, rating 1-5, comment}]
merged_into_session_id uuid null,
created_at, updated_at
UNIQUE (table_id) WHERE status IN ('open','bill_requested')    -- one live session per table
INDEX (restaurant_id, status)
```

### `session_participants`

```
id, organization_id, restaurant_id, session_id → table_sessions.id,
device_id uuid null → diner_devices.id   -- null for staff-created guests
display_name text not null (1..24 chars), color text not null, emoji text null,
role participant_role not null default 'guest',
status participant_status not null default 'active',
is_ready boolean not null default false,
locale locale not null default 'en',      -- join always sends the diner's UI locale; staff-created guests get restaurants.default_locale
created_by_staff_user_id uuid null,
joined_at, last_seen_at, left_at null
UNIQUE (session_id, device_id) WHERE device_id IS NOT NULL
```

### `order_rounds`

```
id, organization_id, restaurant_id, session_id, number integer not null,
status round_status not null, submitted_by_participant_id null, submitted_by_user_id null,
submitted_at, decided_by_user_id null, decided_at null, rejection_reason text null,
kitchen_note text null
UNIQUE (session_id, number)
```

### `session_items`

Covers both cart drafts and ordered items.

```
id, organization_id, restaurant_id, session_id,
participant_id uuid not null → session_participants.id      -- OWNER of the item
round_id uuid null → order_rounds.id                       -- null while draft
menu_item_id uuid not null, variant_id uuid null,
quantity smallint not null check (1..20),
option_ids uuid[] not null default '{}',
removed_ingredient_ids uuid[] not null default '{}',
note text null check (char_length(note) <= 140),
-- price snapshots taken at add time; re-validated at send time
unit_price_minor integer not null,
options_price_minor integer not null default 0,
line_total_minor integer not null,          -- (unit + options) * qty   (before discounts)
name_snapshot jsonb LocalizedText not null,
options_snapshot jsonb not null default '[]',
status session_item_status not null default 'draft',
status_changed_at timestamptz,
voided_reason text null, voided_by_user_id null,
added_by_user_id uuid null,                 -- staff who added it, if any
client_mutation_id text null,
created_at, updated_at
INDEX (session_id, status)
INDEX (restaurant_id, status) WHERE status IN ('accepted','preparing','ready')   -- kitchen
```

### `session_item_shares`

Shared dishes.

```
session_item_id → session_items.id, participant_id → session_participants.id,
weight smallint not null default 1 check (1..20),
organization_id, restaurant_id, created_at
PRIMARY KEY (session_item_id, participant_id)
```

**Rule:** no share rows means 100% belongs to the owner. When shares exist, they define the full split and the owner must be one of the sharers.

### `waiter_calls`

```
id, organization_id, restaurant_id, session_id, participant_id null, type waiter_call_type,
status waiter_call_status default 'open', note text null (≤140),
acknowledged_by_user_id null, acknowledged_at null, resolved_at null, created_at
```

---

## 8. Billing and payments

### `discounts`

```
id, organization_id, restaurant_id, session_id, scope discount_scope, target_id uuid null,
type discount_type, value integer not null,  -- percent in bps (1000 = 10%) or amount in minor
reason text not null, applied_by_user_id, created_at, voided_at null
```

### `payments`

```
id, organization_id, restaurant_id, session_id,
method payment_method not null,
amount_minor integer not null check (> 0),         -- amount applied to the bill, base currency
allocations jsonb not null,                        -- [{ participantId, amountMinor }] sums to amount_minor
tip_minor integer not null default 0,
tendered jsonb null,     -- [{ currency:'USD', amount: 2000 }, { currency:'LBP', amount: 500000 }] (minor units)
change_given jsonb null, -- [{ currency:'LBP', amount: 90000 }]
lbp_rate_used integer null,
payer_participant_id uuid null,
external_reference text null,                       -- Whish/OMT ref (masked in logs)
recorded_by_user_id uuid not null, recorded_at timestamptz not null,
voided_at null, voided_by_user_id null, void_reason text null
INDEX (session_id) INDEX (restaurant_id, recorded_at)
```

### `bill_snapshots`

Written on close; immutable.

```
id, organization_id, restaurant_id, session_id unique,
data jsonb not null,           -- full computeBill() output incl. per-person breakdown
total_minor bigint, currency currency, lbp_rate integer, closed_at
```

---

## 9. AI, chat and insights

### `import_jobs`

```
id, organization_id, restaurant_id, status import_status, source_asset_ids uuid[] not null,
options jsonb not null,         -- { sourceLocales?:[], targetLocales:['ar','en'], currencyHint?:'USD'|'LBP' }
progress jsonb not null default '{}',   -- { pagesTotal, pagesDone, stage }
draft jsonb null,               -- merged ImportedMenu (editable in review)
warnings jsonb not null default '[]',
error jsonb null,
usage jsonb not null default '{}',      -- { inputTokens, outputTokens, cacheReadTokens, costMicros, models:[] }
created_by_user_id, created_at, updated_at, applied_at null
```

### `import_job_pages`

```
id, import_job_id, asset_id, page_index int, status text, result jsonb null, error jsonb null,
model text, usage jsonb, attempts smallint default 0, updated_at
```

### `chat_conversations`

```
id, organization_id, restaurant_id, session_id null, participant_id null, device_id uuid not null,
locale locale, menu_version_id uuid not null, started_at, last_message_at,
message_count integer default 0, flagged boolean default false, flag_reason text null
INDEX (restaurant_id, started_at desc)
```

### `chat_messages`

```
id, organization_id, restaurant_id, conversation_id, role chat_role, content text,
ui_blocks jsonb not null default '[]',      -- dish cards, allergen cards, proposals (ids only)
tool_calls jsonb not null default '[]',     -- [{name, input, resultSummary, ms}]
safety jsonb not null default '{}',         -- { allergenMode, severity, lexiconHits, guardActions[], templateUsed }
model text null, input_tokens int, output_tokens int, cache_read_tokens int, cache_write_tokens int,
cost_micros integer, latency_first_token_ms int, latency_total_ms int,
feedback smallint null,                     -- +1 / -1 from diner
trace_id text null, created_at
INDEX (conversation_id, created_at)
```

### `chat_message_labels`

Nightly classification.

```
message_id pk → chat_messages.id, organization_id, restaurant_id,
intent chat_intent, dish_ids uuid[], allergens allergen_code[], diets diet_tag[],
answer_status answer_status, topic_key text null,   -- normalized cluster key, e.g. "is_X_gluten_free"
model text, classified_at
```

### `menu_events`

Analytics, partitioned by month on `occurred_at`.

```
id bigint generated always as identity, organization_id, restaurant_id,
session_id uuid null, device_id uuid null, type text not null,
-- scan | menu_view | category_view | dish_view | search | filter | add_to_cart | send_round |
-- chat_open | chat_message | waiter_call | bill_view | receipt_view
dish_id uuid null, category_id uuid null, payload jsonb null, locale locale null,
occurred_at timestamptz not null
PRIMARY KEY (id, occurred_at)  PARTITION BY RANGE (occurred_at)
INDEX (restaurant_id, occurred_at)
```

### `daily_metrics`

Rollups by restaurant and day.

```
restaurant_id, day date, organization_id,
scans int, unique_devices int, sessions int, group_sessions int, orders int, items_ordered int,
revenue_minor bigint, avg_participants numeric(4,2), chat_conversations int, chat_messages int,
waiter_calls int, ai_cost_micros bigint,
PRIMARY KEY (restaurant_id, day)
```

### `daily_dish_metrics`

```
restaurant_id, day, dish_id, views int, adds int, ordered_qty int, chat_mentions int,
recommended int, PRIMARY KEY (restaurant_id, day, dish_id)
```

### `insight_reports`

```
id, organization_id, restaurant_id, period_start date, period_end date, metrics jsonb,
summary jsonb not null,      -- { headline:{ar,en}, body:{ar,en}, recommendations:[{type, dishIds, text:{ar,en}}] }
model text, generated_at, delivered jsonb default '[]'   -- [{channel:'email'|'whatsapp', at, status}]
```

---

## 10. Platform

### `subscriptions`

```
organization_id pk, plan plan_code, status subscription_status, current_period_start date,
current_period_end date, grace_until date null, notes text, updated_at
```

### `subscription_payments`

```
id, organization_id, amount_minor integer, currency currency, method payment_method,
reference text null, period_start date, period_end date, recorded_by_user_id, recorded_at, note text
```

### `usage_counters`

```
organization_id, period text ('YYYY-MM'), ai_conversations int, ai_messages int, ai_cost_micros bigint,
import_pages int, whatsapp_messages int, PRIMARY KEY (organization_id, period)
```

### `feature_flags`

```
key text, organization_id uuid null (null = global default), enabled boolean,
PRIMARY KEY (key, organization_id)
```

### `audit_logs`

```
id bigint identity pk, organization_id null, restaurant_id null, actor_type actor_type,
actor_id text null, action text not null,     -- e.g. 'allergens.confirm', 'payment.void', 'price.update'
entity_type text, entity_id text, before jsonb null, after jsonb null, ip_hash text null,
request_id text null, created_at
INDEX (organization_id, created_at desc), INDEX (entity_type, entity_id)
```

### `outbox_events`

```
id bigint identity pk, organization_id, aggregate_type text, aggregate_id uuid, type text,
payload jsonb, room text[], created_at, dispatched_at null
INDEX (dispatched_at) WHERE dispatched_at IS NULL
```

### `notification_optins`

```
id, organization_id, user_id, channel text ('email'|'whatsapp'), address text, verified_at,
topics text[], created_at, revoked_at
```

### `idempotency_keys`

Valkey is the primary store. This Postgres fallback is optional.

```
key text pk, scope text, response jsonb, status_code int, created_at  -- TTL 24h via cleanup job
```

---

## 11. Published snapshot shape (`menu_versions.snapshot`)

```jsonc
{
  "schema": 1,
  "restaurant": { "id": "…", "slug": "beit-tayta", "name": {"ar":"…","en":"…"}, "logo": {…variants}, "theme": {…},
                  "locales": ["en","ar"], "defaultLocale": "en",
                  "currency": { "base": "USD", "showSecondary": true, "lbpRate": 89500, "rounding": {"step":5000,"mode":"nearest"} },
                  "service": { "bps": 1000, "label": {…} }, "tax": { "bps": 1100, "inclusive": true },
                  "orderingMode": "diner_with_approval", "groupOrdering": true, "ai": { "enabled": true, "name": {…} } },
  "categories": [ { "id": "…", "name": {…}, "description": {…}, "schedule": null, "itemIds": ["…"] } ],
  "items": {
    "<itemId>": {
      "id": "…", "token": "D12",                      // short stable token per version for AI/UI
      "name": {…}, "description": {…}, "image": { "thumbhash": "…", "variants": […] },
      "price": 650, "variants": [ { "id": "…", "name": {…}, "price": 650, "default": true } ],
      "spice": 1, "calories": null, "diets": ["vegan"], "tags": ["popular"],
      "ingredients": [ { "id": "…", "name": {…}, "removable": true } ],
      "modifierGroupIds": ["…"],
      "allergens": {                                    // ALREADY FILTERED: unconfirmed ⇒ "unknown"
        "confirmedAt": "2026-10-12T09:30:00Z",          // null if never fully confirmed
        "statuses": { "gluten": "contains", "sesame": "free", "milk": "unknown", … all 14 },
        "notes": {…}
      },
      "schedule": null
    }
  },
  "modifierGroups": { "<groupId>": { "id": "…", "name": {…}, "min": 0, "max": 1,
                      "options": [ { "id": "…", "name": {…}, "delta": 300, "addsAllergens": ["milk"], "addsConfirmed": true } ] } },
  "faq": [ { "q": {…}, "a": {…} } ],
  "publishedAt": "…", "version": 7
}
```

**Token assignment.** `D1..Dn` are assigned in menu order at publish. They are stable within a version only. The AI and UI use tokens; the server maps tokens to IDs.
