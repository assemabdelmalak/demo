import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { importJobs } from './ai.js';
import { user } from './auth.js';
import {
  allergenCodeEnum,
  allergenStatusEnum,
  dietTagEnum,
  itemTagEnum,
  suggestionSourceEnum,
} from './enums.js';
import { assets, restaurants } from './restaurants.js';
import {
  orgIdUnique,
  organizationId,
  restaurantId,
  tenantFk,
  type TenantParent,
} from './tenant.js';
import { createdAt, id, localizedText, money, softDelete, timestamps, tstz } from '../columns.js';

export interface AvailabilityWindow {
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  from: string;
  to: string;
}

/** Per field and language: who wrote the text, e.g. `{ name: { ar: 'owner', en: 'machine' } }`. */
export type TranslationMeta = Record<string, Partial<Record<string, 'owner' | 'machine'>>>;

export const kitchenStations = pgTable(
  'kitchen_stations',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    name: localizedText('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    orgIdUnique('kitchen_stations', t),
    tenantFk('kitchen_stations_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    index('kitchen_stations_restaurant_id_idx').on(t.restaurantId),
  ],
);

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    name: localizedText('name').notNull(),
    description: localizedText('description'),
    position: integer('position').notNull(),
    isVisible: boolean('is_visible').notNull().default(true),
    /** null = always available. */
    availabilitySchedule: jsonb('availability_schedule').$type<AvailabilityWindow[]>(),
    kitchenStationId: uuid('kitchen_station_id'),
    translationMeta: jsonb('translation_meta').$type<TranslationMeta>().notNull().default({}),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    orgIdUnique('menu_categories', t),
    tenantFk('menu_categories_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk(
      'menu_categories_station_fk',
      t,
      t.kitchenStationId,
      (): TenantParent => kitchenStations,
    ),
    index('menu_categories_restaurant_position_idx').on(t.restaurantId, t.position),
    index('menu_categories_kitchen_station_id_idx').on(t.kitchenStationId),
  ],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    categoryId: uuid('category_id').notNull(),
    name: localizedText('name').notNull(),
    description: localizedText('description'),
    position: integer('position').notNull(),
    /** Used when the item has no variants. */
    basePriceMinor: money('base_price_minor').notNull(),
    imageAssetId: uuid('image_asset_id'),
    /** The "86" toggle. */
    isAvailable: boolean('is_available').notNull().default(true),
    isVisible: boolean('is_visible').notNull().default(true),
    availabilitySchedule: jsonb('availability_schedule').$type<AvailabilityWindow[]>(),
    spiceLevel: smallint('spice_level'),
    calories: integer('calories'),
    dietTags: dietTagEnum('diet_tags').array().notNull().default([]),
    itemTags: itemTagEnum('item_tags').array().notNull().default([]),
    prepMinutes: smallint('prep_minutes'),
    kitchenStationId: uuid('kitchen_station_id'),
    translationMeta: jsonb('translation_meta').$type<TranslationMeta>().notNull().default({}),
    // Denormalised: set when all 14 allergens are explicitly set and confirmed (ALLERGEN_SAFETY §4).
    allergensConfirmedAt: tstz('allergens_confirmed_at'),
    allergensConfirmedBy: uuid('allergens_confirmed_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    /** True until confirmed, and again whenever a change invalidates the confirmation. */
    allergensNeedReview: boolean('allergens_need_review').notNull().default(true),
    // `f_unaccent` is the immutable wrapper from the first migration; plain `unaccent` is not
    // allowed in a generated column.
    searchText: text('search_text').generatedAlwaysAs(
      sql`lower(f_unaccent(coalesce(name->>'ar', '') || ' ' || coalesce(name->>'en', '') || ' ' || coalesce(name->>'fr', '')))`,
    ),
    sourceImportJobId: uuid('source_import_job_id'),
    /** Bumped on any change a diner can see. */
    contentVersion: integer('content_version').notNull().default(1),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    orgIdUnique('menu_items', t),
    tenantFk('menu_items_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('menu_items_category_fk', t, t.categoryId, (): TenantParent => menuCategories),
    tenantFk('menu_items_image_asset_fk', t, t.imageAssetId, (): TenantParent => assets),
    tenantFk('menu_items_station_fk', t, t.kitchenStationId, (): TenantParent => kitchenStations),
    tenantFk('menu_items_import_job_fk', t, t.sourceImportJobId, (): TenantParent => importJobs),
    index('menu_items_restaurant_category_position_idx').on(
      t.restaurantId,
      t.categoryId,
      t.position,
    ),
    index('menu_items_category_id_idx').on(t.categoryId),
    index('menu_items_image_asset_id_idx').on(t.imageAssetId),
    index('menu_items_kitchen_station_id_idx').on(t.kitchenStationId),
    index('menu_items_source_import_job_id_idx').on(t.sourceImportJobId),
    index('menu_items_search_text_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    check('menu_items_base_price_check', sql`${t.basePriceMinor} >= 0`),
    check('menu_items_spice_level_check', sql`${t.spiceLevel} between 0 and 3`),
    check('menu_items_calories_check', sql`${t.calories} >= 0`),
    check('menu_items_prep_minutes_check', sql`${t.prepMinutes} >= 0`),
  ],
);

/** Sizes and portions. If an item has variants the diner must pick one and the base price is ignored. */
export const menuItemVariants = pgTable(
  'menu_item_variants',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    itemId: uuid('item_id').notNull(),
    name: localizedText('name').notNull(),
    priceMinor: money('price_minor').notNull(),
    position: integer('position').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    orgIdUnique('menu_item_variants', t),
    tenantFk(
      'menu_item_variants_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
    tenantFk('menu_item_variants_item_fk', t, t.itemId, (): TenantParent => menuItems),
    index('menu_item_variants_item_id_idx').on(t.itemId),
    check('menu_item_variants_price_check', sql`${t.priceMinor} >= 0`),
  ],
);

export const menuItemIngredients = pgTable(
  'menu_item_ingredients',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    itemId: uuid('item_id').notNull(),
    name: localizedText('name').notNull(),
    position: integer('position').notNull().default(0),
    /** Shown on the dish page. */
    isKey: boolean('is_key').notNull().default(true),
    /** "No onions" is allowed as a free modification. */
    isRemovable: boolean('is_removable').notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    orgIdUnique('menu_item_ingredients', t),
    tenantFk(
      'menu_item_ingredients_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
    tenantFk('menu_item_ingredients_item_fk', t, t.itemId, (): TenantParent => menuItems),
    index('menu_item_ingredients_item_id_idx').on(t.itemId),
  ],
);

/**
 * The core of allergen safety (ALLERGEN_SAFETY). What a diner sees is
 * `confirmed_at IS NOT NULL ? status : 'unknown'`; `suggested_*` never reaches a diner.
 */
export const menuItemAllergens = pgTable(
  'menu_item_allergens',
  {
    itemId: uuid('item_id').notNull(),
    allergen: allergenCodeEnum('allergen').notNull(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    /** The owner-set status. */
    status: allergenStatusEnum('status').notNull().default('unknown'),
    /** Set when the owner confirms; null means diners see "unknown". */
    confirmedAt: tstz('confirmed_at'),
    confirmedByUserId: uuid('confirmed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    suggestedStatus: allergenStatusEnum('suggested_status'),
    suggestionSource: suggestionSourceEnum('suggestion_source'),
    /** Short evidence, e.g. "tahini (sesame) in description". */
    suggestionReason: text('suggestion_reason'),
    suggestionConfidence: real('suggestion_confidence'),
    /** Optional owner note shown to diners. */
    notes: localizedText('notes'),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'menu_item_allergens_pk', columns: [t.itemId, t.allergen] }),
    tenantFk(
      'menu_item_allergens_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
    tenantFk('menu_item_allergens_item_fk', t, t.itemId, (): TenantParent => menuItems),
    index('menu_item_allergens_restaurant_id_idx').on(t.restaurantId),
  ],
);

export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    name: localizedText('name').notNull(),
    minSelect: smallint('min_select').notNull().default(0),
    maxSelect: smallint('max_select').notNull().default(1),
    position: integer('position').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    orgIdUnique('modifier_groups', t),
    tenantFk('modifier_groups_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    index('modifier_groups_restaurant_id_idx').on(t.restaurantId),
    check(
      'modifier_groups_select_check',
      sql`${t.minSelect} >= 0 and ${t.maxSelect} >= ${t.minSelect} and ${t.maxSelect} >= 1`,
    ),
  ],
);

export const modifierOptions = pgTable(
  'modifier_options',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    groupId: uuid('group_id').notNull(),
    name: localizedText('name').notNull(),
    priceDeltaMinor: money('price_delta_minor').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    isAvailable: boolean('is_available').notNull().default(true),
    position: integer('position').notNull().default(0),
    /** e.g. "add halloumi" adds milk. */
    addsAllergens: allergenCodeEnum('adds_allergens').array().notNull().default([]),
    /** Unconfirmed means the option's allergen impact is treated as unknown. */
    addsAllergensConfirmedAt: tstz('adds_allergens_confirmed_at'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    orgIdUnique('modifier_options', t),
    tenantFk('modifier_options_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('modifier_options_group_fk', t, t.groupId, (): TenantParent => modifierGroups),
    index('modifier_options_group_id_idx').on(t.groupId),
  ],
);

export const menuItemModifierGroups = pgTable(
  'menu_item_modifier_groups',
  {
    itemId: uuid('item_id').notNull(),
    groupId: uuid('group_id').notNull(),
    // Not in DATA_MODEL's column list; added so the table is covered by RLS (ADR-022).
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'menu_item_modifier_groups_pk', columns: [t.itemId, t.groupId] }),
    tenantFk(
      'menu_item_modifier_groups_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
    tenantFk(
      'menu_item_modifier_groups_item_fk',
      t,
      t.itemId,
      (): TenantParent => menuItems,
      'cascade',
    ),
    tenantFk(
      'menu_item_modifier_groups_group_fk',
      t,
      t.groupId,
      (): TenantParent => modifierGroups,
      'cascade',
    ),
    index('menu_item_modifier_groups_group_id_idx').on(t.groupId),
  ],
);

/** Published, immutable snapshots (DATA_MODEL §11 for the shape). */
export const menuVersions = pgTable(
  'menu_versions',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    /** sha256 of the canonical JSON. */
    snapshotHash: text('snapshot_hash').notNull(),
    /** Compact text for the LLM (AI_ARCHITECTURE §4). */
    aiContextText: text('ai_context_text').notNull(),
    aiContextTokens: integer('ai_context_tokens'),
    stats: jsonb('stats').$type<Record<string, number>>().notNull(),
    publishedByUserId: uuid('published_by_user_id')
      .notNull()
      .references(() => user.id),
    publishedAt: tstz('published_at').notNull(),
  },
  (t) => [
    orgIdUnique('menu_versions', t),
    tenantFk('menu_versions_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    unique('menu_versions_restaurant_version_uq').on(t.restaurantId, t.version),
    check('menu_versions_version_check', sql`${t.version} >= 1`),
  ],
);
