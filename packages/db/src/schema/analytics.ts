import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { localeEnum } from './enums.js';
import { restaurants } from './restaurants.js';
import { organizationId, restaurantId, tenantFk, type TenantParent } from './tenant.js';
import { id, tstz } from '../columns.js';

/**
 * Analytics events. The table is range-partitioned by month on `occurred_at`; Drizzle has no
 * syntax for that, so `PARTITION BY` is added by hand in the migration that creates it, and
 * `ensure_menu_events_partitions()` creates the monthly partitions.
 */
export const menuEvents = pgTable(
  'menu_events',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    sessionId: uuid('session_id'),
    deviceId: uuid('device_id'),
    /** scan, menu_view, category_view, dish_view, search, filter, add_to_cart, send_round, … */
    type: text('type').notNull(),
    dishId: uuid('dish_id'),
    categoryId: uuid('category_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    locale: localeEnum('locale'),
    occurredAt: tstz('occurred_at').notNull(),
  },
  (t) => [
    primaryKey({ name: 'menu_events_pk', columns: [t.id, t.occurredAt] }),
    tenantFk('menu_events_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    index('menu_events_restaurant_occurred_idx').on(t.restaurantId, t.occurredAt),
  ],
);

/** Rollups by restaurant and day. */
export const dailyMetrics = pgTable(
  'daily_metrics',
  {
    restaurantId: restaurantId(),
    day: date('day').notNull(),
    organizationId: organizationId(),
    scans: integer('scans').notNull().default(0),
    uniqueDevices: integer('unique_devices').notNull().default(0),
    sessions: integer('sessions').notNull().default(0),
    groupSessions: integer('group_sessions').notNull().default(0),
    orders: integer('orders').notNull().default(0),
    itemsOrdered: integer('items_ordered').notNull().default(0),
    revenueMinor: bigint('revenue_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    avgParticipants: numeric('avg_participants', { precision: 4, scale: 2 }),
    chatConversations: integer('chat_conversations').notNull().default(0),
    chatMessages: integer('chat_messages').notNull().default(0),
    waiterCalls: integer('waiter_calls').notNull().default(0),
    aiCostMicros: bigint('ai_cost_micros', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    primaryKey({ name: 'daily_metrics_pk', columns: [t.restaurantId, t.day] }),
    tenantFk('daily_metrics_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
  ],
);

export const dailyDishMetrics = pgTable(
  'daily_dish_metrics',
  {
    restaurantId: restaurantId(),
    day: date('day').notNull(),
    /** Not a foreign key: a dish may be deleted while its history stays. */
    dishId: uuid('dish_id').notNull(),
    // Not in DATA_MODEL's column list; added so the table is covered by RLS (ADR-022).
    organizationId: organizationId(),
    views: integer('views').notNull().default(0),
    adds: integer('adds').notNull().default(0),
    orderedQty: integer('ordered_qty').notNull().default(0),
    chatMentions: integer('chat_mentions').notNull().default(0),
    recommended: integer('recommended').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'daily_dish_metrics_pk', columns: [t.restaurantId, t.day, t.dishId] }),
    tenantFk(
      'daily_dish_metrics_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
  ],
);

export interface InsightDelivery {
  channel: 'email' | 'whatsapp';
  at: string;
  status: string;
}

export const insightReports = pgTable(
  'insight_reports',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull(),
    /** `{ headline, body, recommendations }`, each text localised. */
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull(),
    model: text('model'),
    generatedAt: tstz('generated_at').notNull().defaultNow(),
    delivered: jsonb('delivered').$type<InsightDelivery[]>().notNull().default([]),
  },
  (t) => [
    tenantFk('insight_reports_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    index('insight_reports_restaurant_period_idx').on(t.restaurantId, t.periodStart),
  ],
);
