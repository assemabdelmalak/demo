import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { type LocalizedText } from '@radd/shared';

import { user } from './auth.js';
import {
  localeEnum,
  orderingModeEnum,
  participantRoleEnum,
  participantStatusEnum,
  roundStatusEnum,
  sessionItemStatusEnum,
  sessionStatusEnum,
  splitModeEnum,
  waiterCallStatusEnum,
  waiterCallTypeEnum,
} from './enums.js';
import { menuItems, menuItemVariants } from './menu.js';
import { restaurants } from './restaurants.js';
import { diningTables } from './tables.js';
import {
  orgIdUnique,
  organizationId,
  restaurantId,
  tenantFk,
  type TenantParent,
} from './tenant.js';
import { createdAt, id, localizedText, money, timestamps, tstz } from '../columns.js';

/** Anonymous diner browsers. Global, no PII; the ID is the value in the signed device cookie. */
export const dinerDevices = pgTable('diner_devices', {
  id: id(),
  firstSeenAt: tstz('first_seen_at').notNull().defaultNow(),
  lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
  preferredLocale: localeEnum('preferred_locale'),
  lastDisplayName: text('last_display_name'),
  uaHash: text('ua_hash'),
});

export interface SessionFeedback {
  participantId: string;
  rating: number;
  comment?: string;
}

export const tableSessions = pgTable(
  'table_sessions',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    tableId: uuid('table_id').notNull(),
    status: sessionStatusEnum('status').notNull().default('open'),
    /** Bumped on every change in this session; clients resync when they see a gap. */
    version: integer('version').notNull().default(1),
    hostParticipantId: uuid('host_participant_id'),
    /** New joiners need host or staff approval. */
    isLocked: boolean('is_locked').notNull().default(false),
    orderingModeSnapshot: orderingModeEnum('ordering_mode_snapshot').notNull(),
    /** Locked when the bill is requested. */
    lbpRateSnapshot: integer('lbp_rate_snapshot'),
    splitMode: splitModeEnum('split_mode').notNull().default('by_person'),
    openedAt: tstz('opened_at').notNull().defaultNow(),
    billRequestedAt: tstz('bill_requested_at'),
    closedAt: tstz('closed_at'),
    closedByUserId: uuid('closed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    closeReason: text('close_reason'),
    forceClosed: boolean('force_closed').notNull().default(false),
    feedback: jsonb('feedback').$type<SessionFeedback[]>(),
    mergedIntoSessionId: uuid('merged_into_session_id'),
    ...timestamps(),
  },
  (t) => [
    orgIdUnique('table_sessions', t),
    tenantFk('table_sessions_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('table_sessions_table_fk', t, t.tableId, (): TenantParent => diningTables),
    tenantFk(
      'table_sessions_host_fk',
      t,
      t.hostParticipantId,
      (): TenantParent => sessionParticipants,
    ),
    tenantFk(
      'table_sessions_merged_into_fk',
      t,
      t.mergedIntoSessionId,
      (): TenantParent => tableSessions,
    ),
    // One live session per table (GROUP_ORDERING §2).
    uniqueIndex('table_sessions_live_table_uq')
      .on(t.tableId)
      .where(sql`${t.status} in ('open', 'bill_requested')`),
    index('table_sessions_restaurant_status_idx').on(t.restaurantId, t.status),
    index('table_sessions_table_id_idx').on(t.tableId),
    index('table_sessions_host_participant_id_idx').on(t.hostParticipantId),
    index('table_sessions_merged_into_session_id_idx').on(t.mergedIntoSessionId),
    check('table_sessions_version_check', sql`${t.version} >= 1`),
  ],
);

export const sessionParticipants = pgTable(
  'session_participants',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    sessionId: uuid('session_id').notNull(),
    /** null for guests a staff member created. */
    deviceId: uuid('device_id').references(() => dinerDevices.id),
    displayName: text('display_name').notNull(),
    color: text('color').notNull(),
    emoji: text('emoji'),
    role: participantRoleEnum('role').notNull().default('guest'),
    status: participantStatusEnum('status').notNull().default('active'),
    isReady: boolean('is_ready').notNull().default(false),
    // Join always sends the diner's UI locale; staff-created guests get the restaurant default.
    locale: localeEnum('locale').notNull().default('en'),
    createdByStaffUserId: uuid('created_by_staff_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    joinedAt: tstz('joined_at').notNull().defaultNow(),
    lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
    leftAt: tstz('left_at'),
  },
  (t) => [
    orgIdUnique('session_participants', t),
    tenantFk(
      'session_participants_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
    tenantFk('session_participants_session_fk', t, t.sessionId, (): TenantParent => tableSessions),
    uniqueIndex('session_participants_session_device_uq')
      .on(t.sessionId, t.deviceId)
      .where(sql`${t.deviceId} is not null`),
    index('session_participants_session_id_idx').on(t.sessionId),
    index('session_participants_device_id_idx').on(t.deviceId),
    check(
      'session_participants_display_name_check',
      sql`char_length(${t.displayName}) between 1 and 24`,
    ),
  ],
);

export const orderRounds = pgTable(
  'order_rounds',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    sessionId: uuid('session_id').notNull(),
    number: integer('number').notNull(),
    status: roundStatusEnum('status').notNull(),
    submittedByParticipantId: uuid('submitted_by_participant_id'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    submittedAt: tstz('submitted_at').notNull().defaultNow(),
    decidedByUserId: uuid('decided_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    decidedAt: tstz('decided_at'),
    rejectionReason: text('rejection_reason'),
    kitchenNote: text('kitchen_note'),
  },
  (t) => [
    orgIdUnique('order_rounds', t),
    tenantFk('order_rounds_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('order_rounds_session_fk', t, t.sessionId, (): TenantParent => tableSessions),
    tenantFk(
      'order_rounds_submitter_fk',
      t,
      t.submittedByParticipantId,
      (): TenantParent => sessionParticipants,
    ),
    unique('order_rounds_session_number_uq').on(t.sessionId, t.number),
    index('order_rounds_submitted_by_participant_id_idx').on(t.submittedByParticipantId),
    check('order_rounds_number_check', sql`${t.number} >= 1`),
  ],
);

export interface OptionSnapshot {
  optionId: string;
  groupId: string;
  name: LocalizedText;
  priceDeltaMinor: number;
}

/** Cart drafts and ordered items alike. */
export const sessionItems = pgTable(
  'session_items',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    sessionId: uuid('session_id').notNull(),
    /** The owner of the item. */
    participantId: uuid('participant_id').notNull(),
    /** null while the item is a draft. */
    roundId: uuid('round_id'),
    menuItemId: uuid('menu_item_id').notNull(),
    variantId: uuid('variant_id'),
    quantity: smallint('quantity').notNull(),
    optionIds: uuid('option_ids').array().notNull().default([]),
    removedIngredientIds: uuid('removed_ingredient_ids').array().notNull().default([]),
    note: text('note'),
    // Price snapshots taken when the item is added and re-validated when it is sent.
    unitPriceMinor: money('unit_price_minor').notNull(),
    optionsPriceMinor: money('options_price_minor').notNull().default(0),
    /** (unit + options) × quantity, before discounts. */
    lineTotalMinor: money('line_total_minor').notNull(),
    nameSnapshot: localizedText('name_snapshot').notNull(),
    optionsSnapshot: jsonb('options_snapshot').$type<OptionSnapshot[]>().notNull().default([]),
    status: sessionItemStatusEnum('status').notNull().default('draft'),
    statusChangedAt: tstz('status_changed_at'),
    voidedReason: text('voided_reason'),
    voidedByUserId: uuid('voided_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** The staff member who added it, if any. */
    addedByUserId: uuid('added_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    clientMutationId: text('client_mutation_id'),
    ...timestamps(),
  },
  (t) => [
    orgIdUnique('session_items', t),
    tenantFk('session_items_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('session_items_session_fk', t, t.sessionId, (): TenantParent => tableSessions),
    tenantFk(
      'session_items_participant_fk',
      t,
      t.participantId,
      (): TenantParent => sessionParticipants,
    ),
    tenantFk('session_items_round_fk', t, t.roundId, (): TenantParent => orderRounds),
    tenantFk('session_items_menu_item_fk', t, t.menuItemId, (): TenantParent => menuItems),
    tenantFk('session_items_variant_fk', t, t.variantId, (): TenantParent => menuItemVariants),
    index('session_items_session_status_idx').on(t.sessionId, t.status),
    // The kitchen queue.
    index('session_items_kitchen_idx')
      .on(t.restaurantId, t.status)
      .where(sql`${t.status} in ('accepted', 'preparing', 'ready')`),
    index('session_items_participant_id_idx').on(t.participantId),
    index('session_items_round_id_idx').on(t.roundId),
    index('session_items_menu_item_id_idx').on(t.menuItemId),
    index('session_items_variant_id_idx').on(t.variantId),
    check('session_items_quantity_check', sql`${t.quantity} between 1 and 20`),
    check('session_items_note_check', sql`char_length(${t.note}) <= 140`),
    check('session_items_unit_price_check', sql`${t.unitPriceMinor} >= 0`),
    check('session_items_line_total_check', sql`${t.lineTotalMinor} >= 0`),
  ],
);

/**
 * Shared dishes. No rows means the owner pays everything; when rows exist they define the whole
 * split and the owner must be one of the sharers (GROUP_ORDERING §5).
 */
export const sessionItemShares = pgTable(
  'session_item_shares',
  {
    sessionItemId: uuid('session_item_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    weight: smallint('weight').notNull().default(1),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'session_item_shares_pk', columns: [t.sessionItemId, t.participantId] }),
    tenantFk(
      'session_item_shares_restaurant_fk',
      t,
      t.restaurantId,
      (): TenantParent => restaurants,
    ),
    tenantFk(
      'session_item_shares_item_fk',
      t,
      t.sessionItemId,
      (): TenantParent => sessionItems,
      'cascade',
    ),
    tenantFk(
      'session_item_shares_participant_fk',
      t,
      t.participantId,
      (): TenantParent => sessionParticipants,
    ),
    index('session_item_shares_participant_id_idx').on(t.participantId),
    check('session_item_shares_weight_check', sql`${t.weight} between 1 and 20`),
  ],
);

export const waiterCalls = pgTable(
  'waiter_calls',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    sessionId: uuid('session_id').notNull(),
    participantId: uuid('participant_id'),
    type: waiterCallTypeEnum('type').notNull(),
    status: waiterCallStatusEnum('status').notNull().default('open'),
    note: text('note'),
    acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    acknowledgedAt: tstz('acknowledged_at'),
    resolvedAt: tstz('resolved_at'),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk('waiter_calls_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('waiter_calls_session_fk', t, t.sessionId, (): TenantParent => tableSessions),
    tenantFk(
      'waiter_calls_participant_fk',
      t,
      t.participantId,
      (): TenantParent => sessionParticipants,
    ),
    index('waiter_calls_restaurant_status_idx').on(t.restaurantId, t.status),
    index('waiter_calls_session_id_idx').on(t.sessionId),
    index('waiter_calls_participant_id_idx').on(t.participantId),
    check('waiter_calls_note_check', sql`char_length(${t.note}) <= 140`),
  ],
);
