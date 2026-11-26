import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { type Currency } from '@radd/shared';

import { user } from './auth.js';
import { currencyEnum, discountScopeEnum, discountTypeEnum, paymentMethodEnum } from './enums.js';
import { restaurants } from './restaurants.js';
import { sessionParticipants, tableSessions } from './sessions.js';
import { organizationId, restaurantId, tenantFk, type TenantParent } from './tenant.js';
import { createdAt, id, money, tstz } from '../columns.js';

export const discounts = pgTable(
  'discounts',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    sessionId: uuid('session_id').notNull(),
    scope: discountScopeEnum('scope').notNull(),
    /** The item or participant the discount applies to; null for the whole bill. */
    targetId: uuid('target_id'),
    type: discountTypeEnum('type').notNull(),
    /** Percent in basis points (1000 = 10%) or an amount in minor units. */
    value: integer('value').notNull(),
    reason: text('reason').notNull(),
    appliedByUserId: uuid('applied_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    voidedAt: tstz('voided_at'),
  },
  (t) => [
    tenantFk('discounts_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('discounts_session_fk', t, t.sessionId, (): TenantParent => tableSessions),
    index('discounts_session_id_idx').on(t.sessionId),
    check('discounts_value_check', sql`${t.value} > 0`),
    check('discounts_percent_check', sql`${t.type} <> 'percent' or ${t.value} <= 10000`),
  ],
);

export interface PaymentAllocation {
  participantId: string;
  amountMinor: number;
}

export interface TenderedAmount {
  currency: Currency;
  /** Minor units of `currency`. */
  amount: number;
}

export const payments = pgTable(
  'payments',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    sessionId: uuid('session_id').notNull(),
    method: paymentMethodEnum('method').notNull(),
    /** The amount applied to the bill, in the base currency. */
    amountMinor: money('amount_minor').notNull(),
    /** Sums to `amount_minor`. */
    allocations: jsonb('allocations').$type<PaymentAllocation[]>().notNull(),
    tipMinor: money('tip_minor').notNull().default(0),
    tendered: jsonb('tendered').$type<TenderedAmount[]>(),
    changeGiven: jsonb('change_given').$type<TenderedAmount[]>(),
    lbpRateUsed: integer('lbp_rate_used'),
    payerParticipantId: uuid('payer_participant_id'),
    /** Whish or OMT reference; never logged. */
    externalReference: text('external_reference'),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => user.id),
    recordedAt: tstz('recorded_at').notNull(),
    voidedAt: tstz('voided_at'),
    voidedByUserId: uuid('voided_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
  },
  (t) => [
    tenantFk('payments_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('payments_session_fk', t, t.sessionId, (): TenantParent => tableSessions),
    tenantFk('payments_payer_fk', t, t.payerParticipantId, (): TenantParent => sessionParticipants),
    index('payments_session_id_idx').on(t.sessionId),
    index('payments_restaurant_recorded_at_idx').on(t.restaurantId, t.recordedAt),
    index('payments_payer_participant_id_idx').on(t.payerParticipantId),
    check('payments_amount_check', sql`${t.amountMinor} > 0`),
    check('payments_tip_check', sql`${t.tipMinor} >= 0`),
  ],
);

/** Written when a session closes; immutable. */
export const billSnapshots = pgTable(
  'bill_snapshots',
  {
    id: id(),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    sessionId: uuid('session_id').notNull().unique(),
    /** The full `computeBill()` output, including the per-person breakdown. */
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
    currency: currencyEnum('currency').notNull(),
    lbpRate: integer('lbp_rate').notNull(),
    closedAt: tstz('closed_at').notNull(),
  },
  (t) => [
    tenantFk('bill_snapshots_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    tenantFk('bill_snapshots_session_fk', t, t.sessionId, (): TenantParent => tableSessions),
    index('bill_snapshots_restaurant_id_idx').on(t.restaurantId),
  ],
);
