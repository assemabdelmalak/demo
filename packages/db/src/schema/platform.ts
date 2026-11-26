import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organization, user } from './auth.js';
import {
  actorTypeEnum,
  currencyEnum,
  paymentMethodEnum,
  planCodeEnum,
  subscriptionStatusEnum,
} from './enums.js';
import { organizationId } from './tenant.js';
import { createdAt, id, money, tstz } from '../columns.js';

export const subscriptions = pgTable('subscriptions', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organization.id),
  plan: planCodeEnum('plan').notNull(),
  status: subscriptionStatusEnum('status').notNull(),
  currentPeriodStart: date('current_period_start').notNull(),
  currentPeriodEnd: date('current_period_end').notNull(),
  graceUntil: date('grace_until'),
  notes: text('notes'),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const subscriptionPayments = pgTable(
  'subscription_payments',
  {
    id: id(),
    organizationId: organizationId().references(() => organization.id),
    amountMinor: money('amount_minor').notNull(),
    currency: currencyEnum('currency').notNull(),
    method: paymentMethodEnum('method').notNull(),
    reference: text('reference'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => user.id),
    recordedAt: tstz('recorded_at').notNull().defaultNow(),
    note: text('note'),
  },
  (t) => [
    index('subscription_payments_organization_id_idx').on(t.organizationId),
    check('subscription_payments_amount_check', sql`${t.amountMinor} > 0`),
  ],
);

export const usageCounters = pgTable(
  'usage_counters',
  {
    organizationId: organizationId().references(() => organization.id),
    /** `YYYY-MM` */
    period: text('period').notNull(),
    aiConversations: integer('ai_conversations').notNull().default(0),
    aiMessages: integer('ai_messages').notNull().default(0),
    aiCostMicros: bigint('ai_cost_micros', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    importPages: integer('import_pages').notNull().default(0),
    whatsappMessages: integer('whatsapp_messages').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'usage_counters_pk', columns: [t.organizationId, t.period] }),
    check('usage_counters_period_check', sql`${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

/**
 * A null `organization_id` is the global default for a flag. DATA_MODEL lists
 * `(key, organization_id)` as the primary key, which Postgres rejects for a nullable column, so
 * the pair is a `NULLS NOT DISTINCT` unique constraint instead.
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: id(),
    key: text('key').notNull(),
    organizationId: uuid('organization_id').references(() => organization.id),
    enabled: boolean('enabled').notNull(),
  },
  (t) => [unique('feature_flags_key_org_uq').on(t.key, t.organizationId).nullsNotDistinct()],
);

/**
 * Append-only (SECURITY T8): the runtime role may insert and read, never update or delete. No
 * foreign keys, so a log entry outlives whatever it describes.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: uuid('organization_id'),
    restaurantId: uuid('restaurant_id'),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: text('actor_id'),
    /** e.g. `allergens.confirm`, `payment.void`, `price.update`. */
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    /** Keyed hash of the client IP; the raw address is never stored (ADR-017). */
    ipHash: text('ip_hash'),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_organization_created_idx').on(t.organizationId, t.createdAt.desc()),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
  ],
);

/** Transactional outbox (ARCHITECTURE §8): written with the change, dispatched after commit. */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: organizationId().references(() => organization.id),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** Socket.IO rooms to notify. */
    room: text('room').array().notNull(),
    createdAt: createdAt(),
    dispatchedAt: tstz('dispatched_at'),
  },
  (t) => [
    index('outbox_events_undispatched_idx')
      .on(t.createdAt)
      .where(sql`${t.dispatchedAt} is null`),
    index('outbox_events_organization_id_idx').on(t.organizationId),
  ],
);

export const notificationOptins = pgTable(
  'notification_optins',
  {
    id: id(),
    organizationId: organizationId().references(() => organization.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    address: text('address').notNull(),
    verifiedAt: tstz('verified_at'),
    topics: text('topics').array().notNull().default([]),
    createdAt: createdAt(),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [
    index('notification_optins_organization_id_idx').on(t.organizationId),
    index('notification_optins_user_id_idx').on(t.userId),
    check('notification_optins_channel_check', sql`${t.channel} in ('email', 'whatsapp')`),
  ],
);
