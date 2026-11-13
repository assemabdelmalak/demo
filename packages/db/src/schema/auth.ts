import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { uuidv7 } from '@radd/shared';

import { memberRoleEnum, planCodeEnum } from './enums.js';
import { restaurants } from './restaurants.js';
import {
  orgIdUnique,
  organizationId,
  restaurantId,
  tenantFk,
  type TenantParent,
} from './tenant.js';
import { createdAt, timestamps, tstz } from '../columns.js';

// Better Auth's tables (DATA_MODEL §2): global, no RLS. Better Auth finds each one by its export
// name (`user`, `session`, `twoFactor`, …) and each column by its property key, so those must not
// be renamed; the SQL names are ours. IDs are UUIDv7: Better Auth generates them through its
// `generateId` option, and the default here covers rows the seed inserts directly.
const authId = () => uuid('id').primaryKey().$defaultFn(uuidv7);

export const user = pgTable('user', {
  id: authId(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  ...timestamps(),
});

export const organization = pgTable(
  'organization',
  {
    id: authId(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    metadata: text('metadata'),
    createdAt: createdAt(),
    // Additional fields (DATA_MODEL §2). None is writable through Better Auth's client endpoints.
    country: text('country').notNull().default('LB'),
    plan: planCodeEnum('plan').notNull().default('free'),
    status: text('status').notNull().default('active'),
    termsVersionAccepted: text('terms_version_accepted'),
    termsAcceptedAt: tstz('terms_accepted_at'),
  },
  (t) => [check('organization_status_check', sql`${t.status} in ('active', 'suspended')`)],
);

export const session = pgTable(
  'session',
  {
    id: authId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    activeOrganizationId: uuid('active_organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    // Set only by the server (ADR-026, ADR-027); clients cannot write them.
    staffDeviceId: uuid('staff_device_id').references(() => staffDevices.id, {
      onDelete: 'set null',
    }),
    pinSession: boolean('pin_session').notNull().default(false),
    twoFactorVerifiedAt: tstz('two_factor_verified_at'),
    ...timestamps(),
  },
  (t) => [
    index('session_user_id_idx').on(t.userId),
    index('session_staff_device_id_idx').on(t.staffDeviceId),
  ],
);

export const account = pgTable(
  'account',
  {
    id: authId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: tstz('access_token_expires_at'),
    refreshTokenExpiresAt: tstz('refresh_token_expires_at'),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    ...timestamps(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: authId(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    ...timestamps(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

export const member = pgTable(
  'member',
  {
    id: authId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull(),
    createdAt: createdAt(),
    // argon2id hash of the staff quick-switch PIN; never returned by any endpoint.
    pinHash: text('pin_hash'),
    displayName: text('display_name'),
  },
  (t) => [
    unique('member_org_user_uq').on(t.organizationId, t.userId),
    index('member_user_id_idx').on(t.userId),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: authId(),
    email: text('email').notNull(),
    inviterId: uuid('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role'),
    status: text('status').notNull().default('pending'),
    createdAt: createdAt(),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [
    index('invitation_organization_id_idx').on(t.organizationId),
    index('invitation_email_idx').on(t.email),
    index('invitation_inviter_id_idx').on(t.inviterId),
  ],
);

export const twoFactor = pgTable(
  'two_factor',
  {
    id: authId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    verified: boolean('verified').notNull().default(true),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: tstz('locked_until'),
  },
  (t) => [index('two_factor_user_id_idx').on(t.userId)],
);

/** Shared tablets registered by a manager (DATA_MODEL §2). Only the token's hash is stored. */
export const staffDevices = pgTable(
  'staff_devices',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: organizationId(),
    restaurantId: restaurantId(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    registeredByUserId: uuid('registered_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    lastSeenAt: tstz('last_seen_at'),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    orgIdUnique('staff_devices', t),
    tenantFk('staff_devices_restaurant_fk', t, t.restaurantId, (): TenantParent => restaurants),
    index('staff_devices_restaurant_id_idx').on(t.restaurantId),
  ],
);
