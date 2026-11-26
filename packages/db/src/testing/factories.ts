import { randomBytes } from 'node:crypto';

import { uuidv7 } from '@radd/shared';

import { type DbExecutor } from '../client.js';
import * as schema from '../schema/index.js';

// Test data builders (TESTING §5). Each inserts one valid row and returns it, taking only the
// values a test cares about. They never set a tenant context: call them through a connection that
// is allowed to write the rows (the admin role, or `withTenant` for the row's organisation).

const suffix = () => randomBytes(4).toString('hex');
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** `insert … returning` yields an array; a factory always inserts exactly one row. */
function one<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('insert returned no row');
  return row;
}

/** 12 random base58 characters, the shape of a table QR token. */
export function randomQrToken(): string {
  return Array.from(randomBytes(12), (byte) => BASE58[byte % BASE58.length]).join('');
}

export async function createUser(
  db: DbExecutor,
  values: Partial<typeof schema.user.$inferInsert> = {},
) {
  return one(
    await db
      .insert(schema.user)
      .values({ name: 'Test User', email: `user-${suffix()}@example.test`, ...values })
      .returning(),
  );
}

export async function createOrganization(
  db: DbExecutor,
  values: Partial<typeof schema.organization.$inferInsert> = {},
) {
  return one(
    await db
      .insert(schema.organization)
      .values({ name: 'Test Org', slug: `org-${suffix()}`, ...values })
      .returning(),
  );
}

export async function createRestaurant(
  db: DbExecutor,
  organizationId: string,
  values: Partial<typeof schema.restaurants.$inferInsert> = {},
) {
  return one(
    await db
      .insert(schema.restaurants)
      .values({
        organizationId,
        slug: `restaurant-${suffix()}`,
        name: { en: 'Test Restaurant', ar: 'مطعم تجريبي' },
        ...values,
      })
      .returning(),
  );
}

export interface Scope {
  organizationId: string;
  restaurantId: string;
}

export async function createCategory(
  db: DbExecutor,
  scope: Scope,
  values: Partial<typeof schema.menuCategories.$inferInsert> = {},
) {
  return one(
    await db
      .insert(schema.menuCategories)
      .values({ ...scope, name: { en: 'Salads', ar: 'سلطات' }, position: 0, ...values })
      .returning(),
  );
}

export async function createMenuItem(
  db: DbExecutor,
  scope: Scope & { categoryId: string },
  values: Partial<typeof schema.menuItems.$inferInsert> = {},
) {
  return one(
    await db
      .insert(schema.menuItems)
      .values({
        ...scope,
        name: { en: 'Fattoush', ar: 'فتّوش' },
        position: 0,
        basePriceMinor: 650,
        ...values,
      })
      .returning(),
  );
}

export async function createDiningTable(
  db: DbExecutor,
  scope: Scope,
  values: Partial<typeof schema.diningTables.$inferInsert> = {},
) {
  return one(
    await db
      .insert(schema.diningTables)
      .values({ ...scope, label: `T-${suffix()}`, qrToken: randomQrToken(), ...values })
      .returning(),
  );
}

export async function createTableSession(
  db: DbExecutor,
  scope: Scope & { tableId: string },
  values: Partial<typeof schema.tableSessions.$inferInsert> = {},
) {
  return one(
    await db
      .insert(schema.tableSessions)
      .values({ ...scope, orderingModeSnapshot: 'diner_with_approval', ...values })
      .returning(),
  );
}

export async function createDinerDevice(db: DbExecutor) {
  return one(await db.insert(schema.dinerDevices).values({ id: uuidv7() }).returning());
}

export async function createParticipant(
  db: DbExecutor,
  scope: Scope & { sessionId: string },
  values: Partial<typeof schema.sessionParticipants.$inferInsert> = {},
) {
  return one(
    await db
      .insert(schema.sessionParticipants)
      .values({ ...scope, displayName: 'Rami', color: '#4e6b2f', ...values })
      .returning(),
  );
}

export async function createSessionItem(
  db: DbExecutor,
  scope: Scope & { sessionId: string; participantId: string; menuItemId: string },
  values: Partial<typeof schema.sessionItems.$inferInsert> = {},
) {
  return one(
    await db
      .insert(schema.sessionItems)
      .values({
        ...scope,
        quantity: 1,
        unitPriceMinor: 650,
        lineTotalMinor: 650,
        nameSnapshot: { en: 'Fattoush', ar: 'فتّوش' },
        ...values,
      })
      .returning(),
  );
}
