import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';

import { createDb, type DbExecutor } from '../client.js';
import { derivePinPepper, hashPassword, hashPin, verifyPassword, verifyPin } from '../crypto.js';
import * as schema from '../schema/index.js';
import { withAdmin, withTenant } from '../tenant.js';
import {
  SEED_DISHES,
  SEED_MEMBERS,
  SEED_ORGANIZATION,
  SEED_RESTAURANT,
  SEED_SESSIONS,
  SEED_SUPER_ADMIN,
  type SeedUser,
} from './data.js';
import { base32Encode, seedTotpSecret } from './ids.js';
import {
  accountId,
  buildSessionRows,
  buildTenantRows,
  SEED_IDS,
  seedIds,
  type SessionRows,
  twoFactorId,
} from './rows.js';
import { type UpsertCounts, upsertRows } from './upsert.js';

export type SeedAppEnv = 'local' | 'test' | 'staging' | 'production';

export interface SeedOptions {
  /** `DATABASE_URL`: the API's role, so Row Level Security checks every tenant row written. */
  runtimeUrl: string;
  /** `DATABASE_URL_ADMIN`: only for the subscription row, which the runtime role cannot write. */
  adminUrl: string;
  /** `BETTER_AUTH_SECRET`, the API's own: the PIN pepper and the TOTP encryption depend on it. */
  authSecret: string;
  appEnv: SeedAppEnv;
  /** Adds the demo sessions on tables 5 and 9 (SEED_DATA "Demo session"). */
  withSession?: boolean;
  /** Start of the subscription year; today by default. */
  now?: Date;
}

export interface SeedReport {
  /** Per table: rows inserted, updated (they differed from the seed) and left as they were. */
  counts: Record<string, UpsertCounts>;
  superAdmin: { email: string; password: string; totpSecret: string; otpauthUri: string } | null;
  /** Demo sessions not written because another live session holds their table. */
  skippedSessions: { table: number; reason: string }[];
}

export class SeedConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedConflictError';
  }
}

/** APP_ENVs that get the local super admin (SEED_DATA: "local only"). */
const SUPER_ADMIN_ENVS: readonly SeedAppEnv[] = ['local', 'test'];
const TOTP_ISSUER = 'Radd Menu';

function otpauthUri(email: string, secretBase32: string): string {
  const params = new URLSearchParams({ secret: secretBase32, issuer: TOTP_ISSUER });
  params.set('digits', '6');
  params.set('period', '30');
  return `otpauth://totp/${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(email)}?${params.toString()}`;
}

/** A stored hash that still verifies is kept, so re-seeding leaves the row unchanged. */
async function keepOrHash(
  stored: string | null | undefined,
  verify: (stored: string) => Promise<boolean>,
  hash: () => Promise<string>,
): Promise<string> {
  if (stored && (await verify(stored))) return stored;
  return hash();
}

async function decrypts(secret: string, data: string, expected?: string): Promise<boolean> {
  try {
    const plain = await symmetricDecrypt({ key: secret, data });
    return expected === undefined ? Array.isArray(JSON.parse(plain)) : plain === expected;
  } catch {
    return false;
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Refuses to run where seeded rows would collide with real ones the seed did not create. */
async function assertNoForeignRows(db: DbExecutor, users: readonly SeedUser[]): Promise<void> {
  const clashes: string[] = [];
  for (const user of users) {
    const [row] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.email, user.email), ne(schema.user.id, seedIds.user(user.key))));
    if (row) clashes.push(`an account ${user.email}`);
  }
  const [org] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(
      and(
        eq(schema.organization.slug, SEED_ORGANIZATION.slug),
        ne(schema.organization.id, SEED_IDS.organization),
      ),
    );
  if (org) clashes.push(`an organisation with the slug "${SEED_ORGANIZATION.slug}"`);
  const [restaurant] = await db
    .select({ id: schema.restaurants.id })
    .from(schema.restaurants)
    .where(
      and(
        eq(schema.restaurants.slug, SEED_RESTAURANT.slug),
        ne(schema.restaurants.id, SEED_IDS.restaurant),
      ),
    );
  if (restaurant) clashes.push(`a restaurant with the slug "${SEED_RESTAURANT.slug}"`);
  if (clashes.length > 0) {
    throw new SeedConflictError(
      `The database already has ${clashes.join(', ')} that the seed did not create. ` +
        'Seed a fresh database, or remove those rows first.',
    );
  }
}

async function writeAuthRows(
  tx: DbExecutor,
  options: SeedOptions,
  counts: SeedReport['counts'],
): Promise<SeedReport['superAdmin']> {
  const withAdminUser = SUPER_ADMIN_ENVS.includes(options.appEnv);
  const people: SeedUser[] = withAdminUser
    ? [...SEED_MEMBERS, SEED_SUPER_ADMIN]
    : [...SEED_MEMBERS];
  const userId = seedIds.user;

  counts.user = await upsertRows(
    tx,
    schema.user,
    people.map((person) => ({
      id: userId(person.key),
      name: person.name,
      email: person.email,
      emailVerified: true,
      image: null,
      twoFactorEnabled: person.key === SEED_SUPER_ADMIN.key,
    })),
    { target: schema.user.id },
  );

  const existingAccounts = await tx
    .select({ id: schema.account.id, password: schema.account.password })
    .from(schema.account)
    .where(
      inArray(
        schema.account.id,
        people.map((person) => accountId(person.key)),
      ),
    );
  const storedPassword = new Map(existingAccounts.map((row) => [row.id, row.password]));
  const accounts = [];
  for (const person of people) {
    const id = accountId(person.key);
    accounts.push({
      id,
      userId: userId(person.key),
      // Better Auth's email-and-password accounts: provider `credential`, account ID = user ID.
      accountId: userId(person.key),
      providerId: 'credential',
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      idToken: null,
      password: await keepOrHash(
        storedPassword.get(id),
        (stored) => verifyPassword(stored, person.password),
        () => hashPassword(person.password),
      ),
    });
  }
  counts.account = await upsertRows(tx, schema.account, accounts, { target: schema.account.id });

  counts.organization = await upsertRows(
    tx,
    schema.organization,
    [
      {
        id: SEED_IDS.organization,
        name: SEED_ORGANIZATION.name,
        slug: SEED_ORGANIZATION.slug,
        logo: null,
        metadata: null,
        country: 'LB',
        plan: SEED_ORGANIZATION.plan,
        status: 'active',
      },
    ],
    { target: schema.organization.id },
  );

  const pepper = derivePinPepper(options.authSecret);
  const existingMembers = await tx
    .select({ id: schema.member.id, pinHash: schema.member.pinHash })
    .from(schema.member)
    .where(
      inArray(
        schema.member.id,
        SEED_MEMBERS.map((person) => seedIds.member(person.key)),
      ),
    );
  const storedPin = new Map(existingMembers.map((row) => [row.id, row.pinHash]));
  const members = [];
  for (const person of SEED_MEMBERS) {
    const id = seedIds.member(person.key);
    const { pin } = person;
    members.push({
      id,
      userId: userId(person.key),
      organizationId: SEED_IDS.organization,
      role: person.role,
      // Written directly, with the API's pepper scheme; the API would refuse "1234" as weak, but
      // SEED_DATA asks for it on this demo account only (ADR-033).
      pinHash: pin
        ? await keepOrHash(
            storedPin.get(id),
            (stored) => verifyPin(stored, pin, pepper),
            () => hashPin(pin, pepper),
          )
        : null,
      pinDisabledAt: null,
      displayName: null,
    });
  }
  counts.member = await upsertRows(tx, schema.member, members, { target: schema.member.id });

  if (!withAdminUser) return null;

  const adminId = userId(SEED_SUPER_ADMIN.key);
  const secretId = twoFactorId(SEED_SUPER_ADMIN.key);
  const totpSecret = seedTotpSecret(options.authSecret);
  // A second-factor row made in the console for this user would compete with the seeded one.
  await tx
    .delete(schema.twoFactor)
    .where(and(eq(schema.twoFactor.userId, adminId), ne(schema.twoFactor.id, secretId)));
  const [stored] = await tx
    .select({ secret: schema.twoFactor.secret, backupCodes: schema.twoFactor.backupCodes })
    .from(schema.twoFactor)
    .where(eq(schema.twoFactor.id, secretId));
  // Better Auth stores both encrypted with BETTER_AUTH_SECRET (`symmetricEncrypt`); the random
  // nonce makes every encryption different, so a value that still decrypts correctly is kept.
  const secret =
    stored && (await decrypts(options.authSecret, stored.secret, totpSecret))
      ? stored.secret
      : await symmetricEncrypt({ key: options.authSecret, data: totpSecret });
  const backupCodes =
    stored && (await decrypts(options.authSecret, stored.backupCodes))
      ? stored.backupCodes
      : await symmetricEncrypt({ key: options.authSecret, data: '[]' });
  counts.two_factor = await upsertRows(
    tx,
    schema.twoFactor,
    [
      {
        id: secretId,
        userId: adminId,
        secret,
        backupCodes,
        verified: true,
        failedVerificationCount: 0,
        lockedUntil: null,
      },
    ],
    { target: schema.twoFactor.id },
  );

  const totpSecretBase32 = base32Encode(totpSecret);
  return {
    email: SEED_SUPER_ADMIN.email,
    password: SEED_SUPER_ADMIN.password,
    totpSecret: totpSecretBase32,
    otpauthUri: otpauthUri(SEED_SUPER_ADMIN.email, totpSecretBase32),
  };
}

async function writeTenantRows(
  tx: DbExecutor,
  secret: string,
  counts: SeedReport['counts'],
): Promise<void> {
  const rows = buildTenantRows(secret);
  const s = schema;
  counts.restaurants = await upsertRows(tx, s.restaurants, rows.restaurants, {
    target: s.restaurants.id,
  });
  // History is insert-only for the runtime role (ADR-021); the seeded entry never changes.
  counts.exchange_rate_history = await upsertRows(
    tx,
    s.exchangeRateHistory,
    rows.exchangeRateHistory,
    {
      target: s.exchangeRateHistory.id,
      insertOnly: Object.keys(rows.exchangeRateHistory[0] ?? {}),
    },
  );
  counts.restaurant_faq = await upsertRows(tx, s.restaurantFaq, rows.restaurantFaq, {
    target: s.restaurantFaq.id,
  });
  counts.kitchen_stations = await upsertRows(tx, s.kitchenStations, rows.kitchenStations, {
    target: s.kitchenStations.id,
  });
  counts.dining_areas = await upsertRows(tx, s.diningAreas, rows.diningAreas, {
    target: s.diningAreas.id,
  });
  // A printed QR code must keep working, so a table keeps the token it was first given.
  counts.dining_tables = await upsertRows(tx, s.diningTables, rows.diningTables, {
    target: s.diningTables.id,
    insertOnly: ['qrToken'],
  });
  counts.modifier_groups = await upsertRows(tx, s.modifierGroups, rows.modifierGroups, {
    target: s.modifierGroups.id,
  });
  counts.modifier_options = await upsertRows(tx, s.modifierOptions, rows.modifierOptions, {
    target: s.modifierOptions.id,
  });
  counts.menu_categories = await upsertRows(tx, s.menuCategories, rows.menuCategories, {
    target: s.menuCategories.id,
  });
  counts.menu_items = await upsertRows(tx, s.menuItems, rows.menuItems, {
    target: s.menuItems.id,
  });
  counts.menu_item_variants = await upsertRows(tx, s.menuItemVariants, rows.menuItemVariants, {
    target: s.menuItemVariants.id,
  });
  counts.menu_item_ingredients = await upsertRows(
    tx,
    s.menuItemIngredients,
    rows.menuItemIngredients,
    { target: s.menuItemIngredients.id },
  );
  counts.menu_item_allergens = await upsertRows(tx, s.menuItemAllergens, rows.menuItemAllergens, {
    target: [s.menuItemAllergens.itemId, s.menuItemAllergens.allergen],
  });
  counts.menu_item_modifier_groups = await upsertRows(
    tx,
    s.menuItemModifierGroups,
    rows.menuItemModifierGroups,
    { target: [s.menuItemModifierGroups.itemId, s.menuItemModifierGroups.groupId] },
  );
}

/** Keeps only the rows of the demo sessions in `sessionIds`. */
function onlySessions(rows: SessionRows, sessionIds: ReadonlySet<string>): SessionRows {
  const participants = rows.sessionParticipants.filter((row) => sessionIds.has(row.sessionId));
  const devices = new Set(participants.map((row) => row.deviceId));
  const items = rows.sessionItems.filter((row) => sessionIds.has(row.sessionId));
  const itemIds = new Set(items.map((row) => row.id));
  return {
    dinerDevices: rows.dinerDevices.filter((row) => devices.has(row.id)),
    tableSessions: rows.tableSessions.filter((row) => row.id && sessionIds.has(row.id)),
    sessionParticipants: participants,
    hosts: rows.hosts.filter((row) => sessionIds.has(row.sessionId)),
    orderRounds: rows.orderRounds.filter((row) => sessionIds.has(row.sessionId)),
    sessionItems: items,
    sessionItemShares: rows.sessionItemShares.filter((row) => itemIds.has(row.sessionItemId)),
  };
}

async function writeSessionRows(
  tx: DbExecutor,
  counts: SeedReport['counts'],
): Promise<SeedReport['skippedSessions']> {
  const skipped: SeedReport['skippedSessions'] = [];
  const keep = new Set<string>();
  for (const session of SEED_SESSIONS) {
    const sessionId = seedIds.session(session.key);
    // One live session per table (GROUP_ORDERING §2): a real one wins over the demo.
    const [other] = await tx
      .select({ id: schema.tableSessions.id })
      .from(schema.tableSessions)
      .where(
        and(
          eq(schema.tableSessions.tableId, seedIds.table(session.table)),
          ne(schema.tableSessions.id, sessionId),
          or(
            eq(schema.tableSessions.status, 'open'),
            eq(schema.tableSessions.status, 'bill_requested'),
          ),
        ),
      );
    if (other) skipped.push({ table: session.table, reason: 'another session is open there' });
    else keep.add(sessionId);
  }
  const rows = onlySessions(buildSessionRows(), keep);
  const s = schema;
  counts.diner_devices = await upsertRows(tx, s.dinerDevices, rows.dinerDevices, {
    target: s.dinerDevices.id,
  });
  counts.table_sessions = await upsertRows(tx, s.tableSessions, rows.tableSessions, {
    target: s.tableSessions.id,
  });
  counts.session_participants = await upsertRows(
    tx,
    s.sessionParticipants,
    rows.sessionParticipants,
    { target: s.sessionParticipants.id },
  );
  for (const { sessionId, hostParticipantId } of rows.hosts) {
    await tx
      .update(s.tableSessions)
      .set({ hostParticipantId })
      .where(
        and(
          eq(s.tableSessions.id, sessionId),
          sql`${s.tableSessions.hostParticipantId} is distinct from ${hostParticipantId}::uuid`,
        ),
      );
  }
  counts.order_rounds = await upsertRows(tx, s.orderRounds, rows.orderRounds, {
    target: s.orderRounds.id,
    insertOnly: ['decidedAt'],
  });
  counts.session_items = await upsertRows(tx, s.sessionItems, rows.sessionItems, {
    target: s.sessionItems.id,
  });
  counts.session_item_shares = await upsertRows(tx, s.sessionItemShares, rows.sessionItemShares, {
    target: [s.sessionItemShares.sessionItemId, s.sessionItemShares.participantId],
  });
  return skipped;
}

/**
 * Seeds the demo restaurant "Beit Tayta" (SEED_DATA). Idempotent: every row has a deterministic
 * ID and is written only when it differs, so a second run changes nothing. Tenant rows are
 * written as `app_runtime` inside `withTenant`, so Row Level Security checks each one; only the
 * subscription needs the admin role. Seeded rows bypass the API, so they leave no audit entries
 * or outbox events.
 */
export async function runSeed(options: SeedOptions): Promise<SeedReport> {
  if (options.appEnv === 'production') {
    throw new SeedConflictError('The demo seed never runs in production (APP_ENV=production).');
  }
  const runtime = createDb({ url: options.runtimeUrl, max: 2, applicationName: 'radd-seed' });
  const admin = createDb({ url: options.adminUrl, max: 1, applicationName: 'radd-seed-admin' });
  const counts: SeedReport['counts'] = {};
  try {
    const people = SUPER_ADMIN_ENVS.includes(options.appEnv)
      ? [...SEED_MEMBERS, SEED_SUPER_ADMIN]
      : [...SEED_MEMBERS];
    await withAdmin(admin.db, (tx) => assertNoForeignRows(tx, people));

    let superAdmin: SeedReport['superAdmin'] = null;
    let skippedSessions: SeedReport['skippedSessions'] = [];
    await withTenant(runtime.db, SEED_IDS.organization, async (tx) => {
      superAdmin = await writeAuthRows(tx, options, counts);
      await writeTenantRows(tx, options.authSecret, counts);
      if (options.withSession) skippedSessions = await writeSessionRows(tx, counts);
    });

    // Plans are set by the platform, never by the API's role (ADR-021): pro for one year,
    // renewed only if the current period is over or the row was changed.
    const now = options.now ?? new Date();
    const end = new Date(now);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    await withAdmin(admin.db, async (tx) => {
      const s = schema.subscriptions;
      const written = await tx
        .insert(s)
        .values({
          organizationId: SEED_IDS.organization,
          plan: SEED_ORGANIZATION.plan,
          status: 'active',
          currentPeriodStart: isoDate(now),
          currentPeriodEnd: isoDate(end),
          graceUntil: null,
          notes: 'Demo subscription (seed)',
        })
        .onConflictDoUpdate({
          target: s.organizationId,
          set: {
            plan: sql`excluded.plan`,
            status: sql`excluded.status`,
            currentPeriodStart: sql`excluded.current_period_start`,
            currentPeriodEnd: sql`excluded.current_period_end`,
            graceUntil: null,
            notes: sql`excluded.notes`,
          },
          setWhere: sql`subscriptions.plan <> excluded.plan or subscriptions.status <> excluded.status
            or subscriptions.current_period_end < ${isoDate(now)}::date
            or subscriptions.grace_until is not null
            or subscriptions.notes is distinct from excluded.notes`,
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      const inserted = written.filter((row) => row.inserted).length;
      counts.subscriptions = {
        inserted,
        updated: written.length - inserted,
        unchanged: 1 - written.length,
      };
    });

    return { counts, superAdmin, skippedSessions };
  } finally {
    await Promise.all([runtime.close(), admin.close()]);
  }
}

/** Totals over every table of a report. */
export function totals(report: SeedReport): UpsertCounts {
  return Object.values(report.counts).reduce(
    (sum, count) => ({
      inserted: sum.inserted + count.inserted,
      updated: sum.updated + count.updated,
      unchanged: sum.unchanged + count.unchanged,
    }),
    { inserted: 0, updated: 0, unchanged: 0 },
  );
}

export const SEED_SUMMARY = {
  dishes: SEED_DISHES.length,
  unconfirmedDishes: SEED_DISHES.filter((dish) => !dish.confirmed).map((dish) => dish.key),
} as const;
