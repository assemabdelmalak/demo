import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { organization, user } from './auth.js';
import {
  assetKindEnum,
  currencyEnum,
  localeEnum,
  orderingModeEnum,
  restaurantStatusEnum,
} from './enums.js';
import { menuVersions } from './menu.js';
import {
  orgIdUnique,
  organizationId,
  restaurantId,
  tenantFk,
  type TenantParent,
} from './tenant.js';
import { citext, createdAt, id, localizedText, softDelete, timestamps, tstz } from '../columns.js';

export interface RestaurantTheme {
  preset: string;
  primaryColor?: string;
  fontPair?: string;
  cornerStyle?: 'soft' | 'sharp';
  dark?: boolean;
}

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday. */
  day: number;
  /** "HH:mm" in the restaurant's timezone; `close` before `open` means past midnight. */
  open: string;
  close: string;
}

export interface AssetVariant {
  format: 'avif' | 'webp';
  width: number;
  key: string;
  bytes: number;
}

export const assets = pgTable(
  'assets',
  {
    id: id(),
    organizationId: organizationId().references(() => organization.id),
    kind: assetKindEnum('kind').notNull(),
    bucket: text('bucket').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    thumbhash: text('thumbhash'),
    variants: jsonb('variants').$type<AssetVariant[]>().notNull().default([]),
    status: text('status').notNull().default('pending'),
    originalFilename: text('original_filename'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    ...softDelete(),
  },
  (t) => [
    orgIdUnique('assets', t),
    index('assets_organization_id_idx').on(t.organizationId),
    check('assets_status_check', sql`${t.status} in ('pending', 'ready', 'failed')`),
    check('assets_bytes_check', sql`${t.bytes} >= 0`),
  ],
);

export const restaurants = pgTable(
  'restaurants',
  {
    id: id(),
    organizationId: organizationId().references(() => organization.id),
    slug: citext('slug').notNull().unique(),
    name: localizedText('name').notNull(),
    description: localizedText('description'),
    address: localizedText('address'),
    city: text('city'),
    phone: text('phone'),
    whatsappNumber: text('whatsapp_number'),
    instagramHandle: text('instagram_handle'),
    logoAssetId: uuid('logo_asset_id'),
    coverAssetId: uuid('cover_asset_id'),
    theme: jsonb('theme').$type<RestaurantTheme>().notNull().default({ preset: 'zaatar' }),
    timezone: text('timezone').notNull().default('Asia/Beirut'),
    // ADR-009: English first.
    defaultLocale: localeEnum('default_locale').notNull().default('en'),
    enabledLocales: localeEnum('enabled_locales').array().notNull().default(['en', 'ar']),
    baseCurrency: currencyEnum('base_currency').notNull().default('USD'),
    showSecondaryCurrency: boolean('show_secondary_currency').notNull().default(true),
    /** LBP per 1 USD. */
    lbpRate: integer('lbp_rate').notNull().default(89_500),
    /** 0 = no rounding; otherwise e.g. 1000, 5000, 10000. */
    lbpRoundingStep: integer('lbp_rounding_step').notNull().default(5_000),
    lbpRoundingMode: text('lbp_rounding_mode').notNull().default('nearest'),
    taxRateBps: integer('tax_rate_bps').notNull().default(1_100),
    taxInclusive: boolean('tax_inclusive').notNull().default(true),
    taxAppliesToService: boolean('tax_applies_to_service').notNull().default(true),
    serviceChargeBps: integer('service_charge_bps').notNull().default(0),
    serviceChargeLabel: localizedText('service_charge_label'),
    orderingMode: orderingModeEnum('ordering_mode').notNull().default('browse_only'),
    groupOrderingEnabled: boolean('group_ordering_enabled').notNull().default(true),
    requireStaffApproval: boolean('require_staff_approval').notNull().default(true),
    lockNewJoinersDefault: boolean('lock_new_joiners_default').notNull().default(false),
    aiAssistantEnabled: boolean('ai_assistant_enabled').notNull().default(true),
    aiSettings: jsonb('ai_settings').$type<Record<string, unknown>>().notNull().default({}),
    openingHours: jsonb('opening_hours').$type<OpeningHours[]>().notNull().default([]),
    status: restaurantStatusEnum('status').notNull().default('draft'),
    publishedMenuVersionId: uuid('published_menu_version_id'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    orgIdUnique('restaurants', t),
    index('restaurants_organization_id_idx').on(t.organizationId),
    tenantFk('restaurants_logo_asset_fk', t, t.logoAssetId, (): TenantParent => assets),
    tenantFk('restaurants_cover_asset_fk', t, t.coverAssetId, (): TenantParent => assets),
    tenantFk(
      'restaurants_published_version_fk',
      t,
      t.publishedMenuVersionId,
      (): TenantParent => menuVersions,
    ),
    index('restaurants_published_menu_version_id_idx').on(t.publishedMenuVersionId),
    check('restaurants_slug_check', sql`${t.slug} ~ '^[a-z0-9-]{3,48}$'`),
    check('restaurants_lbp_rate_check', sql`${t.lbpRate} > 0`),
    check('restaurants_lbp_rounding_step_check', sql`${t.lbpRoundingStep} >= 0`),
    check('restaurants_lbp_rounding_mode_check', sql`${t.lbpRoundingMode} in ('nearest', 'up')`),
    check('restaurants_tax_rate_check', sql`${t.taxRateBps} between 0 and 10000`),
    check('restaurants_service_charge_check', sql`${t.serviceChargeBps} between 0 and 10000`),
  ],
);

export const exchangeRateHistory = pgTable(
  'exchange_rate_history',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    lbpRate: integer('lbp_rate').notNull(),
    effectiveAt: tstz('effective_at').notNull(),
    setByUserId: uuid('set_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk(
      'exchange_rate_history_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
    index('exchange_rate_history_restaurant_effective_idx').on(
      t.restaurantId,
      t.effectiveAt.desc(),
    ),
    check('exchange_rate_history_lbp_rate_check', sql`${t.lbpRate} > 0`),
  ],
);

/** Owner-provided facts the assistant may use. */
export const restaurantFaq = pgTable(
  'restaurant_faq',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    question: localizedText('question').notNull(),
    answer: localizedText('answer').notNull(),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    tenantFk('restaurant_faq_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    index('restaurant_faq_restaurant_position_idx').on(t.restaurantId, t.position),
  ],
);

/** Translation glossary. */
export const glossaryTerms = pgTable(
  'glossary_terms',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    term: localizedText('term').notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk('glossary_terms_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    index('glossary_terms_restaurant_id_idx').on(t.restaurantId),
  ],
);
