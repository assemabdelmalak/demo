import { symmetricDecrypt } from 'better-auth/crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { detectIntegrationRuntime, type StartedService, startPostgres } from '@radd/config/testing';
import { uuidv7 } from '@radd/shared';

import { createDb, type DbHandle } from '../client.js';
import { derivePinPepper, verifyPassword, verifyPin } from '../crypto.js';
import { withTenant } from '../tenant.js';
import { SEED_MEMBERS, SEED_SUPER_ADMIN } from './data.js';
import { base32Encode, seedTotpSecret } from './ids.js';
import { accountId, SEED_IDS, seedIds, twoFactorId } from './rows.js';
import { runSeed, type SeedOptions, SeedConflictError, totals } from './run.js';
import { createTestDatabase, type TestDatabase } from '../testing/index.js';

const runtime = await detectIntegrationRuntime(['postgres']);

const SECRET = 'an integration-test secret of a realistic length 1234';

/** Every table the seed writes, plus the two it must leave alone. */
const TABLES = [
  'user',
  'account',
  'organization',
  'member',
  'two_factor',
  'subscriptions',
  'restaurants',
  'exchange_rate_history',
  'restaurant_faq',
  'kitchen_stations',
  'dining_areas',
  'dining_tables',
  'modifier_groups',
  'modifier_options',
  'menu_categories',
  'menu_items',
  'menu_item_variants',
  'menu_item_ingredients',
  'menu_item_allergens',
  'menu_item_modifier_groups',
  'diner_devices',
  'table_sessions',
  'session_participants',
  'order_rounds',
  'session_items',
  'session_item_shares',
  'audit_logs',
  'outbox_events',
] as const;

const UNCONFIRMED = ['vine-leaves', 'sujuk', 'shish-taouk', 'lahm-bi-ajeen'];

describe.skipIf(!runtime.ready)('pnpm db:seed (P1-T08, SEED_DATA)', () => {
  let postgres: StartedService;
  let database: TestDatabase;
  let superuser: DbHandle;
  let app: DbHandle;

  const options = (overrides: Partial<SeedOptions> = {}): SeedOptions => ({
    runtimeUrl: database.urls.runtime,
    adminUrl: database.urls.admin,
    authSecret: SECRET,
    appEnv: 'test',
    withSession: true,
    ...overrides,
  });

  const rows = async <T>(db: DbHandle, query: ReturnType<typeof sql>) =>
    (await db.db.execute(query)).rows as T[];

  /** Every row of every seeded table, as JSON, including created_at and updated_at. */
  async function snapshot(db: DbHandle): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const table of TABLES) {
      const [row] = await rows<{ data: unknown }>(
        db,
        sql.raw(
          `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]') as data from "${table}" t`,
        ),
      );
      out[table] = row?.data;
    }
    return out;
  }

  beforeAll(async () => {
    postgres = await startPostgres();
    database = await createTestDatabase(postgres.url);
    superuser = createDb({ url: database.urls.superuser, max: 2 });
    app = createDb({ url: database.urls.runtime, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([superuser.close(), app.close()]);
    await database.drop();
    await postgres.stop();
  });

  describe('on a fresh database', () => {
    let first: Record<string, unknown>;

    it('creates the restaurant, and a second run changes nothing at all', async () => {
      const created = await runSeed(options());
      expect(totals(created)).toMatchObject({ updated: 0, unchanged: 0 });
      expect(totals(created).inserted).toBeGreaterThan(600);
      first = await snapshot(superuser);

      const again = await runSeed(options());
      expect(totals(again)).toEqual({
        inserted: 0,
        updated: 0,
        unchanged: totals(created).inserted,
      });
      // Identical content, row for row, timestamps included.
      expect(await snapshot(superuser)).toEqual(first);
    });

    it('has the restaurant SEED_DATA describes', async () => {
      const [counts] = await rows<Record<string, number>>(
        superuser,
        sql`select
          (select count(*)::int from "user") users,
          (select count(*)::int from member where organization_id = ${SEED_IDS.organization}) members,
          (select count(*)::int from menu_categories) categories,
          (select count(*)::int from menu_items) dishes,
          (select count(*)::int from menu_item_allergens) allergen_rows,
          (select count(*)::int from modifier_groups) groups,
          (select count(*)::int from modifier_options) options,
          (select count(*)::int from dining_tables) tables,
          (select count(*)::int from kitchen_stations) stations,
          (select count(*)::int from restaurant_faq) faq,
          (select count(*)::int from table_sessions) sessions`,
      );
      expect(counts).toEqual({
        users: 5,
        members: 4,
        categories: 7,
        dishes: 28,
        allergen_rows: 28 * 14,
        groups: 5,
        options: 9,
        tables: 12,
        stations: 4,
        faq: 4,
        sessions: 2,
      });
      const [setup] = await rows<Record<string, unknown>>(
        superuser,
        sql`select o.plan, o.status as org_status, s.plan as sub_plan, s.status as sub_status,
                   s.current_period_end - s.current_period_start as days, r.status, r.slug::text,
                   r.default_locale, r.enabled_locales::text, r.published_menu_version_id
              from organization o
              join subscriptions s on s.organization_id = o.id
              join restaurants r on r.organization_id = o.id`,
      );
      expect(setup).toMatchObject({
        plan: 'pro',
        org_status: 'active',
        sub_plan: 'pro',
        sub_status: 'active',
        status: 'draft',
        slug: 'beit-tayta',
        default_locale: 'en',
        enabled_locales: '{en,ar,fr}',
        published_menu_version_id: null,
      });
      expect([365, 366]).toContain(setup?.days);
    });

    it('gives every dish 14 allergen rows and keeps the four unconfirmed dishes unconfirmed', async () => {
      const perDish = await rows<{
        id: string;
        rows: number;
        confirmed: number;
        item: string | null;
      }>(
        superuser,
        sql`select i.id, count(a.*)::int as rows, count(a.confirmed_at)::int as confirmed,
                   i.allergens_confirmed_at::text as item
              from menu_items i left join menu_item_allergens a on a.item_id = i.id
             group by i.id`,
      );
      expect(perDish).toHaveLength(28);
      for (const dish of perDish) {
        expect(dish.rows).toBe(14);
        // All 14 or none, on the rows and the item alike.
        expect([0, 14]).toContain(dish.confirmed);
        expect(dish.item === null).toBe(dish.confirmed === 0);
      }
      const unconfirmed = perDish.filter((dish) => dish.confirmed === 0).map((dish) => dish.id);
      expect(unconfirmed.sort()).toEqual(UNCONFIRMED.map(seedIds.dish).sort());
      // A diner would see "Not confirmed" for every allergen of those dishes.
      const visible = await rows<{ status: string }>(
        superuser,
        sql`select distinct case when confirmed_at is null then 'unknown' else status::text end as status
              from menu_item_allergens where item_id in ${UNCONFIRMED.map(seedIds.dish)}`,
      );
      expect(visible).toEqual([{ status: 'unknown' }]);
    });

    it('stores credentials the API can verify', async () => {
      for (const person of [...SEED_MEMBERS, SEED_SUPER_ADMIN]) {
        const [account] = await rows<{ password: string; provider_id: string; account_id: string }>(
          superuser,
          sql`select password, provider_id, account_id from account where id = ${accountId(person.key)}`,
        );
        expect(account).toMatchObject({
          provider_id: 'credential',
          account_id: seedIds.user(person.key),
        });
        expect(account?.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
        expect(await verifyPassword(account?.password ?? '', person.password)).toBe(true);
      }
      const [staff] = await rows<{ pin_hash: string }>(
        superuser,
        sql`select pin_hash from member where id = ${SEED_IDS.members.staff}`,
      );
      expect(await verifyPin(staff?.pin_hash ?? '', '1234', derivePinPepper(SECRET))).toBe(true);
      const [twoFactor] = await rows<{ secret: string; backup_codes: string }>(
        superuser,
        sql`select secret, backup_codes from two_factor where id = ${twoFactorId(SEED_SUPER_ADMIN.key)}`,
      );
      const totp = await symmetricDecrypt({ key: SECRET, data: twoFactor?.secret ?? '' });
      expect(totp).toBe(seedTotpSecret(SECRET));
      expect(await symmetricDecrypt({ key: SECRET, data: twoFactor?.backup_codes ?? '' })).toBe(
        '[]',
      );
      const report = await runSeed(options());
      expect(report.superAdmin).toMatchObject({
        email: 'admin@radd.test',
        totpSecret: base32Encode(totp),
      });
    });

    it('writes no audit entries or outbox events (it bypasses the API)', () => {
      expect(first.audit_logs).toEqual([]);
      expect(first.outbox_events).toEqual([]);
    });

    it('keeps tenant rows behind Row Level Security', async () => {
      const count = sql`select count(*)::int as n from menu_items`;
      expect(await rows(app, count)).toEqual([{ n: 0 }]);
      const own = await withTenant(app.db, SEED_IDS.organization, (tx) => tx.execute(count));
      expect(own.rows).toEqual([{ n: 28 }]);
      const other = await withTenant(app.db, uuidv7(), (tx) => tx.execute(count));
      expect(other.rows).toEqual([{ n: 0 }]);
    });

    it('puts back what someone changed, and only that', async () => {
      const vineLeaves = seedIds.dish('vine-leaves');
      await superuser.db.execute(
        sql`update menu_item_allergens set status = 'free', confirmed_at = now() where item_id = ${vineLeaves}`,
      );
      await superuser.db.execute(
        sql`update menu_items set allergens_confirmed_at = now(), allergens_need_review = false, base_price_minor = 1
             where id = ${vineLeaves}`,
      );
      await superuser.db.execute(
        sql`delete from menu_item_allergens where item_id = ${seedIds.dish('hummus')} and allergen = 'sesame'`,
      );
      await superuser.db.execute(
        sql`update account set password = 'not a hash' where id = ${accountId('owner')}`,
      );

      const report = await runSeed(options());
      expect(report.counts.menu_item_allergens).toMatchObject({ inserted: 1, updated: 14 });
      expect(report.counts.menu_items).toMatchObject({ inserted: 0, updated: 1 });
      expect(report.counts.account).toMatchObject({ updated: 1 });
      expect(report.counts.restaurants).toMatchObject({ inserted: 0, updated: 0 });

      const [item] = await rows<Record<string, unknown>>(
        superuser,
        sql`select allergens_confirmed_at, allergens_need_review, base_price_minor from menu_items where id = ${vineLeaves}`,
      );
      expect(item).toEqual({
        allergens_confirmed_at: null,
        allergens_need_review: true,
        base_price_minor: 600,
      });
      expect(
        await rows(
          superuser,
          sql`select distinct status::text, confirmed_at from menu_item_allergens where item_id = ${vineLeaves}`,
        ),
      ).toEqual([{ status: 'unknown', confirmed_at: null }]);
      const [owner] = await rows<{ password: string }>(
        superuser,
        sql`select password from account where id = ${accountId('owner')}`,
      );
      expect(await verifyPassword(owner?.password ?? '', 'DemoOwner!2026')).toBe(true);
      // Then it is stable again.
      expect(totals(await runSeed(options()))).toMatchObject({ inserted: 0, updated: 0 });
    });
  });

  describe('guard rails', () => {
    let fresh: TestDatabase;
    let freshSql: DbHandle;
    const freshOptions = (overrides: Partial<SeedOptions> = {}): SeedOptions => ({
      runtimeUrl: fresh.urls.runtime,
      adminUrl: fresh.urls.admin,
      authSecret: SECRET,
      appEnv: 'test',
      ...overrides,
    });
    const userCount = async () =>
      (await rows<{ n: number }>(freshSql, sql`select count(*)::int as n from "user"`))[0]?.n;

    beforeAll(async () => {
      fresh = await createTestDatabase(postgres.url);
      freshSql = createDb({ url: fresh.urls.superuser, max: 2 });
    });

    afterAll(async () => {
      await freshSql.close();
      await fresh.drop();
    });

    it('never runs in production', async () => {
      await expect(runSeed(freshOptions({ appEnv: 'production' }))).rejects.toBeInstanceOf(
        SeedConflictError,
      );
      expect(await userCount()).toBe(0);
    });

    it('refuses to take over an account it did not create', async () => {
      await freshSql.db.execute(
        sql`insert into "user" (id, name, email) values (${uuidv7()}, 'Someone', 'owner@beit-tayta.test')`,
      );
      await expect(runSeed(freshOptions())).rejects.toThrow(/owner@beit-tayta\.test/);
      expect(await userCount()).toBe(1);
      await freshSql.db.execute(sql`delete from "user" where email = 'owner@beit-tayta.test'`);
    });

    it('seeds no super admin outside local and test', async () => {
      const report = await runSeed(freshOptions({ appEnv: 'staging' }));
      expect(report.superAdmin).toBeNull();
      expect(await userCount()).toBe(4);
      expect(
        await rows(freshSql, sql`select 1 from "user" where email = ${SEED_SUPER_ADMIN.email}`),
      ).toEqual([]);
    });

    it('leaves a table alone when a real session is open there', async () => {
      await freshSql.db.execute(
        sql`insert into table_sessions (id, organization_id, restaurant_id, table_id, ordering_mode_snapshot)
            values (${uuidv7()}, ${SEED_IDS.organization}, ${SEED_IDS.restaurant}, ${seedIds.table(9)}, 'diner_with_approval')`,
      );
      const report = await runSeed(freshOptions({ withSession: true }));
      expect(report.skippedSessions).toEqual([
        { table: 9, reason: 'another session is open there' },
      ]);
      expect(
        await rows(
          freshSql,
          sql`select id from table_sessions where id = ${seedIds.session('table-5')}`,
        ),
      ).toHaveLength(1);
      expect(
        await rows(
          freshSql,
          sql`select id from table_sessions where id = ${seedIds.session('table-9')}`,
        ),
      ).toHaveLength(0);
    });
  });
});
