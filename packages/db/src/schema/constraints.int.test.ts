import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { detectIntegrationRuntime, type StartedService, startPostgres } from '@radd/config/testing';

import * as schema from './index.js';
import { createDb, type DbHandle } from '../client.js';
import {
  createCategory,
  createDinerDevice,
  createDiningTable,
  createMenuItem,
  createOrganization,
  createParticipant,
  createRestaurant,
  createSessionItem,
  createTableSession,
  createTestDatabase,
  type Scope,
  type TestDatabase,
} from '../testing/index.js';

const runtime = await detectIntegrationRuntime(['postgres']);

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

/** The Postgres error code of a failing statement; Drizzle wraps the driver error as `cause`. */
async function pgCode(statement: Promise<unknown>): Promise<string | undefined> {
  try {
    await statement;
    return undefined;
  } catch (error) {
    const source = (error as { cause?: unknown }).cause ?? error;
    return (source as { code?: string }).code;
  }
}

describe.skipIf(!runtime.ready)('schema constraints (DATA_MODEL)', () => {
  let postgres: StartedService;
  let database: TestDatabase;
  let handle: DbHandle;
  let scope: Scope;
  let categoryId: string;
  let menuItemId: string;

  beforeAll(async () => {
    postgres = await startPostgres();
    database = await createTestDatabase(postgres.url);
    // The admin role may write any organisation's rows, so these tests exercise the constraints
    // themselves; Row Level Security has its own suite.
    handle = createDb({ url: database.urls.admin });
    const organization = await createOrganization(handle.db);
    const restaurant = await createRestaurant(handle.db, organization.id);
    scope = { organizationId: organization.id, restaurantId: restaurant.id };
    categoryId = (await createCategory(handle.db, scope)).id;
    menuItemId = (await createMenuItem(handle.db, { ...scope, categoryId })).id;
  });

  afterAll(async () => {
    await handle.close();
    await database.drop();
    await postgres.stop();
  });

  async function openSession() {
    const table = await createDiningTable(handle.db, scope);
    const session = await createTableSession(handle.db, { ...scope, tableId: table.id });
    const participant = await createParticipant(handle.db, { ...scope, sessionId: session.id });
    return { table, session, participant };
  }

  it('allows one live session per table, and a new one once it is closed', async () => {
    const { table, session } = await openSession();
    const second = () => createTableSession(handle.db, { ...scope, tableId: table.id });

    expect(await pgCode(second())).toBe(UNIQUE_VIOLATION);

    await handle.db
      .update(schema.tableSessions)
      .set({ status: 'bill_requested' })
      .where(eq(schema.tableSessions.id, session.id));
    expect(await pgCode(second())).toBe(UNIQUE_VIOLATION);

    await handle.db
      .update(schema.tableSessions)
      .set({ status: 'closed' })
      .where(eq(schema.tableSessions.id, session.id));
    expect(await pgCode(second())).toBeUndefined();
  });

  it('admits a device once per session; staff-created guests have no device', async () => {
    const { session } = await openSession();
    const device = await createDinerDevice(handle.db);
    const join = (deviceId: string | null) =>
      createParticipant(handle.db, { ...scope, sessionId: session.id }, { deviceId });

    expect(await pgCode(join(device.id))).toBeUndefined();
    expect(await pgCode(join(device.id))).toBe(UNIQUE_VIOLATION);
    expect(await pgCode(join(null))).toBeUndefined();
    expect(await pgCode(join(null))).toBeUndefined();
  });

  it('holds one share per participant for a shared dish', async () => {
    const { session, participant } = await openSession();
    const item = await createSessionItem(handle.db, {
      ...scope,
      sessionId: session.id,
      participantId: participant.id,
      menuItemId,
    });
    const share = () =>
      handle.db
        .insert(schema.sessionItemShares)
        .values({ ...scope, sessionItemId: item.id, participantId: participant.id });

    expect(await pgCode(share())).toBeUndefined();
    expect(await pgCode(share())).toBe(UNIQUE_VIOLATION);
  });

  it('rejects quantities outside 1..20, notes over 140 characters and negative prices', async () => {
    const { session, participant } = await openSession();
    const line = { ...scope, sessionId: session.id, participantId: participant.id, menuItemId };
    const add = (values: Parameters<typeof createSessionItem>[2]) =>
      pgCode(createSessionItem(handle.db, line, values));

    expect(await add({ quantity: 0 })).toBe(CHECK_VIOLATION);
    expect(await add({ quantity: 21 })).toBe(CHECK_VIOLATION);
    expect(await add({ quantity: 20 })).toBeUndefined();
    expect(await add({ note: 'x'.repeat(141) })).toBe(CHECK_VIOLATION);
    expect(await add({ note: 'x'.repeat(140) })).toBeUndefined();
    expect(await add({ unitPriceMinor: -1 })).toBe(CHECK_VIOLATION);

    const item = (basePriceMinor: number) =>
      pgCode(createMenuItem(handle.db, { ...scope, categoryId }, { basePriceMinor }));
    expect(await item(-1)).toBe(CHECK_VIOLATION);
    expect(await item(0)).toBeUndefined();

    const variant = (priceMinor: number) =>
      pgCode(
        handle.db
          .insert(schema.menuItemVariants)
          .values({ ...scope, itemId: menuItemId, name: { en: 'For two' }, priceMinor }),
      );
    expect(await variant(-1)).toBe(CHECK_VIOLATION);
    expect(await variant(3_400)).toBeUndefined();
  });

  it("cannot attach a row to another organisation's parent by ID", async () => {
    const other = await createOrganization(handle.db);
    const otherRestaurant = await createRestaurant(handle.db, other.id);
    const otherScope = { organizationId: other.id, restaurantId: otherRestaurant.id };

    // A dish in the other organisation pointing at this organisation's category.
    expect(await pgCode(createMenuItem(handle.db, { ...otherScope, categoryId }))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
    // A row claiming this organisation but another organisation's restaurant.
    expect(
      await pgCode(createCategory(handle.db, { ...scope, restaurantId: otherRestaurant.id })),
    ).toBe(FOREIGN_KEY_VIOLATION);
  });

  it('builds an accent-free, lower-case search text from every language', async () => {
    const item = await createMenuItem(
      handle.db,
      { ...scope, categoryId },
      { name: { en: 'Crème Brûlée', ar: 'كريم بروليه', fr: 'Taboulé' } },
    );
    expect(item.searchText).toBe('كريم بروليه creme brulee taboule');
  });

  it('refreshes updated_at on every update, and every such table has the trigger', async () => {
    const { session } = await openSession();
    await handle.db.execute(sql`select pg_sleep(0.01)`);
    const [updated] = await handle.db
      .update(schema.tableSessions)
      .set({ version: 2 })
      .where(eq(schema.tableSessions.id, session.id))
      .returning();
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(session.updatedAt.getTime());

    const { rows } = await handle.db.execute<{ table_name: string }>(sql`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at' and not a.attisdropped
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
        and not exists (
          select from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'set_updated_at'
        )`);
    expect(rows.map((row) => row.table_name)).toEqual([]);
  });

  it('has menu_events partitions for this month and the next two, and routes rows to them', async () => {
    const { rows } = await handle.db.execute<{ months: number }>(sql`
      select count(*)::int as months
      from pg_inherits i
      where i.inhparent = 'public.menu_events'::regclass`);
    expect(rows[0]?.months).toBe(3);

    const event = (occurredAt: Date) =>
      pgCode(handle.db.insert(schema.menuEvents).values({ ...scope, type: 'scan', occurredAt }));
    expect(await event(new Date())).toBeUndefined();

    // Calling the maintenance function again is harmless and extends the range. Only the schema
    // owner may call it.
    const migrator = createDb({ url: database.urls.migrator });
    await migrator.db.execute(sql`select ensure_menu_events_partitions(3)`);
    await migrator.close();
    const inFourMonths = new Date();
    inFourMonths.setUTCDate(1);
    inFourMonths.setUTCMonth(inFourMonths.getUTCMonth() + 3);
    expect(await event(inFourMonths)).toBeUndefined();
  });
});
