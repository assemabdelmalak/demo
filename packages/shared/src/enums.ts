import { LOCALES } from './i18n.js';

/**
 * Single source for every enumerated value in DATA_MODEL §1. `packages/db` builds its Postgres
 * enums from these arrays, and zod schemas use them through `z.enum(...)`, so the database, the
 * API and the UI cannot drift apart. Values are append-only: Postgres cannot drop an enum value
 * that rows still use.
 */
export const LOCALE_VALUES = LOCALES;

export const CURRENCIES = ['USD', 'LBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const MEMBER_ROLES = ['owner', 'manager', 'staff', 'kitchen'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const RESTAURANT_STATUSES = ['draft', 'live', 'suspended'] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

export const ORDERING_MODES = [
  'browse_only',
  'staff_entry',
  'diner_with_approval',
  'diner_direct',
] as const;
export type OrderingMode = (typeof ORDERING_MODES)[number];

/** The 14 EU allergens (ALLERGEN_SAFETY §2). */
export const ALLERGEN_CODES = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'tree_nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type AllergenCode = (typeof ALLERGEN_CODES)[number];

export const ALLERGEN_STATUSES = ['contains', 'may_contain', 'free', 'unknown'] as const;
export type AllergenStatus = (typeof ALLERGEN_STATUSES)[number];

export const SUGGESTION_SOURCES = ['ai', 'import_text', 'owner'] as const;
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];

export const DIET_TAGS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'halal',
  'alcohol',
  'contains_pork',
] as const;
export type DietTag = (typeof DIET_TAGS)[number];

export const ITEM_TAGS = ['new', 'chef_pick', 'popular', 'signature', 'seasonal'] as const;
export type ItemTag = (typeof ITEM_TAGS)[number];

export const ASSET_KINDS = ['image', 'pdf', 'spreadsheet', 'export', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const IMPORT_STATUSES = [
  'queued',
  'processing',
  'needs_review',
  'applying',
  'applied',
  'failed',
  'cancelled',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const SESSION_STATUSES = ['open', 'bill_requested', 'closed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const PARTICIPANT_ROLES = ['host', 'guest'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const PARTICIPANT_STATUSES = ['active', 'left', 'removed', 'pending_approval'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const SESSION_ITEM_STATUSES = [
  'draft',
  'pending_approval',
  'accepted',
  'preparing',
  'ready',
  'served',
  'rejected',
  'voided',
  'removed',
] as const;
export type SessionItemStatus = (typeof SESSION_ITEM_STATUSES)[number];

export const ROUND_STATUSES = [
  'pending_approval',
  'accepted',
  'partially_accepted',
  'rejected',
] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const WAITER_CALL_TYPES = [
  'call_waiter',
  'request_bill',
  'water',
  'allergy_help',
  'other',
] as const;
export type WaiterCallType = (typeof WAITER_CALL_TYPES)[number];

export const WAITER_CALL_STATUSES = ['open', 'acknowledged', 'resolved', 'cancelled'] as const;
export type WaiterCallStatus = (typeof WAITER_CALL_STATUSES)[number];

export const PAYMENT_METHODS = [
  'cash_usd',
  'cash_lbp',
  'card',
  'whish',
  'omt',
  'bank_transfer',
  'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DISCOUNT_SCOPES = ['item', 'participant', 'bill'] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];

export const DISCOUNT_TYPES = ['percent', 'amount'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const SPLIT_MODES = ['by_person', 'equal', 'custom'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const CHAT_ROLES = ['user', 'assistant'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const CHAT_INTENTS = [
  'ingredients',
  'allergen',
  'diet',
  'recommendation',
  'price',
  'substitution',
  'availability',
  'restaurant_info',
  'ordering_help',
  'off_topic',
  'other',
] as const;
export type ChatIntent = (typeof CHAT_INTENTS)[number];

export const ANSWER_STATUSES = [
  'answered',
  'deferred_to_staff',
  'data_missing',
  'refused',
  'error',
] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export const PLAN_CODES = ['free', 'pro', 'bundle'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'grace', 'expired', 'suspended'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const ACTOR_TYPES = ['user', 'staff_device', 'diner', 'system', 'super_admin'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** `organization.status` (DATA_MODEL §2); plain text in the database, checked there. */
export const ORGANIZATION_STATUSES = ['active', 'suspended'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
