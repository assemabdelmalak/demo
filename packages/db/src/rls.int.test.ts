import { eq, sql } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { detectIntegrationRuntime, type StartedService, startPostgres } from '@radd/config/testing';

import { createDb, type Db, type DbHandle } from './client.js';
import * as schema from './schema/index.js';
import {
  BaseTenantRepository,
  MissingTenantContextError,
  withAdmin,
  withPublic,
  withTenant,
} from './tenant.js';
import {
  createOrganization,
  createRestaurant,
  createTenantFixture,
  createTestDatabase,
  createUser,
  type TenantFixture,
  type TestDatabase,
} from './testing/index.js';

const runtime = await detectIntegrationRuntime(['postgres']);

/**
 * Tables that are deliberately not tenant-scoped (DATA_MODEL §2, §7). Every other table must have
 * `organization_id`, Row Level Security and a policy. Adding a name here is a security decision.
 */
const GLOBAL_TABLES = [
  'account',
  'diner_devices',
  'invitation',
  'member',
  'organization',
  'session',
  'two_factor',
  'user',
  'verification',
];

const INSUFFICIENT_PRIVILEGE = '42501';

async function pgCode(statement: Promise<unknown>): Promise<string | undefined> {
  try {
    await statement;
    return undefined;
  } catch (error) {
    const source = (error as { cause?: unknown }).cause ?? error;
    return (source as { code?: string }).code ?? 'unknown';
  }
}

class Rollback extends Error {}

/** Runs statements as an organisation and always rolls back, so a test never changes the fixture. */
async function probe<T>(
  db: Db,
  organizationId: string,
  run: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  await withTenant(db, organizationId, async (tx) => {
    result = await run(tx);
    throw new Rollback();
  }).catch((error: unknown) => {
    if (!(error instanceof Rollback)) throw error;
  });
  return result as T;
}

interface CatalogTable {
  name: string;
  rls: boolean;
  hasOrganizationId: boolean;
  policies: number;
}

describe.skipIf(!runtime.ready)('tenant isolation (SECURITY §3, ADR-022)', () => {
  let postgres: StartedService;
  let database: TestDatabase;
  let catalog: Client;
  let admin: DbHandle;
  let app: DbHandle;
  let worker: DbHandle;
  let orgA: TenantFixture;
  let orgB: string;
  let tables: CatalogTable[];
  let tenantTables: string[];

  beforeAll(async () => {
    postgres = await startPostgres();
    database = await createTestDatabase(postgres.url);
    catalog = new Client({ connectionString: database.urls.superuser });
    await catalog.connect();
    admin = createDb({ url: database.urls.admin });
    app = createDb({ url: database.urls.runtime });
    worker = createDb({ url: database.urls.worker });

    orgA = await createTenantFixture(admin.db);
    orgB = (await createOrganization(admin.db)).id;

    const result = await catalog.query<CatalogTable>(`
      select c.relname::text as name,
             c.relrowsecurity as rls,
             exists (
               select from pg_attribute a
               where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
             ) as "hasOrganizationId",
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
       order by 1`);
    tables = result.rows;
    tenantTables = tables
      .map((table) => table.name)
      .filter((name) => !GLOBAL_TABLES.includes(name));
  });

  afterAll(async () => {
    await Promise.all([admin.close(), app.close(), worker.close(), catalog.end()]);
    await database.drop();
    await postgres.stop();
  });

  const count = async (db: Db | Parameters<Parameters<typeof withTenant>[2]>[0], table: string) => {
    const { rows } = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)}`,
    );
    return rows[0]?.n ?? -1;
  };

  it('has Row Level Security and a policy on every table that is not on the global allowlist', () => {
    const unprotected = tables
      .filter((table) => !GLOBAL_TABLES.includes(table.name))
      .filter((table) => !table.hasOrganizationId || !table.rls || table.policies === 0)
      .map((table) => table.name);
    expect(unprotected).toEqual([]);

    // The allowlist itself must not go stale.
    const names = tables.map((table) => table.name);
    expect(GLOBAL_TABLES.filter((name) => !names.includes(name))).toEqual([]);
    expect(tenantTables).toHaveLength(43);
  });

  it('keys every reference between tenant tables on the organisation as well', async () => {
    const { rows } = await catalog.query<{
      name: string;
      source: string;
      target: string;
      scoped: boolean;
    }>(`
      select con.conname::text as name, src.relname::text as source, dst.relname::text as target,
             exists (
               select from unnest(con.conkey) key
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = key
               where a.attname = 'organization_id'
             ) as scoped
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_class dst on dst.oid = con.confrelid
        join pg_namespace n on n.oid = src.relnamespace
       where con.contype = 'f' and n.nspname = 'public' and not src.relispartition`);
    const unscoped = rows
      .filter((fk) => tenantTables.includes(fk.source) && tenantTables.includes(fk.target))
      .filter((fk) => !fk.scoped)
      .map((fk) => `${fk.source}.${fk.name}`);
    expect(unscoped).toEqual([]);
  });

  it('has a fixture row for organisation A in every tenant table, visible to A', async () => {
    const empty: string[] = [];
    for (const table of tenantTables) {
      const visible = await probe(app.db, orgA.organizationId, (tx) => count(tx, table));
      if (visible < 1) empty.push(table);
    }
    // A table listed here needs a row in createTenantFixture().
    expect(empty).toEqual([]);
  });

  it('lets organisation B read, update and delete nothing of organisation A, in every tenant table', async () => {
    const leaks: string[] = [];
    for (const table of tenantTables) {
      const id = sql.identifier(table);
      const seen = await probe(app.db, orgB, (tx) => count(tx, table));
      if (seen !== 0) leaks.push(`${table}: B read ${String(seen)} row(s)`);

      for (const [verb, statement] of [
        ['update', sql`update ${id} set organization_id = organization_id`],
        ['delete', sql`delete from ${id}`],
      ] as const) {
        // Either the statement touches no row, or the role may not run it at all.
        const outcome = await probe(
          app.db,
          orgB,
          async (tx) => (await tx.execute(statement)).rowCount,
        )
          .then((affected) => ({ affected, code: undefined }))
          .catch((error: unknown) => ({
            affected: null,
            code: (error as { cause?: { code?: string } }).cause?.code ?? 'unknown',
          }));
        const blocked =
          outcome.code === INSUFFICIENT_PRIVILEGE ||
          (outcome.code === undefined && outcome.affected === 0);
        if (!blocked) {
          leaks.push(
            `${table}: B ${verb} affected ${String(outcome.affected)} (code ${String(outcome.code)})`,
          );
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("rejects B writing a row under A's organisation, and A moving a row to B, in every tenant table", async () => {
    const leaks: string[] = [];
    for (const table of tenantTables) {
      const id = sql.identifier(table);
      // Columns a client can set: not generated, not identity.
      const { rows: columns } = await catalog.query<{ name: string }>(
        `select a.attname::text as name from pg_attribute a
          where a.attrelid = ('public.' || quote_ident($1))::regclass and a.attnum > 0
            and not a.attisdropped and a.attgenerated = '' and a.attidentity = ''
          order by a.attnum`,
        [table],
      );
      const list = sql.join(
        columns.map((column) => sql.identifier(column.name)),
        sql`, `,
      );
      const {
        rows: [source],
      } = await admin.db.execute<{ row: unknown }>(
        sql`select to_jsonb(t) as row from ${id} t where organization_id = ${orgA.organizationId} limit 1`,
      );

      // B replays one of A's rows, organisation included.
      const insert = await pgCode(
        probe(app.db, orgB, (tx) =>
          tx.execute(
            sql`insert into ${id} (${list}) select ${list} from jsonb_populate_record(null::${id}, ${JSON.stringify(source?.row)}::jsonb)`,
          ),
        ),
      );
      if (insert !== INSUFFICIENT_PRIVILEGE)
        leaks.push(`${table}: insert as B gave ${String(insert)}`);

      // A hands one of its rows to B.
      const move = await pgCode(
        probe(app.db, orgA.organizationId, (tx) =>
          tx.execute(sql`update ${id} set organization_id = ${orgB}`),
        ),
      );
      if (move !== INSUFFICIENT_PRIVILEGE) leaks.push(`${table}: move to B gave ${String(move)}`);
    }
    expect(leaks).toEqual([]);
  });

  it('shows no tenant rows without withTenant(), and no partition directly', async () => {
    const visible: string[] = [];
    for (const table of tenantTables) {
      if ((await count(app.db, table)) !== 0) visible.push(table);
    }
    expect(visible).toEqual([]);

    const { rows: partitions } = await catalog.query<{ name: string }>(
      `select inhrelid::regclass::text as name from pg_inherits where inhparent = 'public.menu_events'::regclass`,
    );
    expect(partitions.length).toBeGreaterThan(0);
    for (const partition of partitions) {
      const direct = probe(app.db, orgA.organizationId, (tx) =>
        tx.execute(sql`select count(*) from ${sql.raw(partition.name)}`),
      );
      expect(await pgCode(direct)).toBe(INSUFFICIENT_PRIVILEGE);
    }
  });

  it('applies the same isolation to the worker role', async () => {
    expect(await count(worker.db, 'restaurants')).toBe(0);
    expect(await probe(worker.db, orgB, (tx) => count(tx, 'restaurants'))).toBe(0);
    expect(await probe(worker.db, orgA.organizationId, (tx) => count(tx, 'restaurants'))).toBe(1);
    // The worker never needs credentials or sessions.
    for (const table of ['session', 'account', 'verification', 'two_factor', 'invitation']) {
      expect(await pgCode(count(worker.db, table))).toBe(INSUFFICIENT_PRIVILEGE);
    }
  });

  it('keeps the organisation setting inside its transaction on a pooled connection', async () => {
    const single = createDb({ url: database.urls.runtime, max: 1 });
    try {
      expect(
        await withTenant(single.db, orgA.organizationId, (tx) => count(tx, 'restaurants')),
      ).toBe(1);
      // Same physical connection, next statement: the setting is gone.
      expect(await count(single.db, 'restaurants')).toBe(0);
      await expect(
        withTenant(single.db, 'not-a-uuid', (tx) => count(tx, 'restaurants')),
      ).rejects.toThrow(TypeError);
    } finally {
      await single.close();
    }
  });

  it('lets the admin role see every organisation', async () => {
    const other = await createRestaurant(admin.db, orgB);
    const seen = await withAdmin(admin.db, (tx) => count(tx, 'restaurants'));
    expect(seen).toBeGreaterThanOrEqual(2);
    await admin.db.delete(schema.restaurants).where(eq(schema.restaurants.id, other.id));
  });

  describe('public reads', () => {
    let liveRestaurantId: string;
    let publishedVersionId: string;
    let olderVersionId: string;

    beforeAll(async () => {
      const organization = await createOrganization(admin.db);
      const user = await createUser(admin.db);
      const live = await createRestaurant(admin.db, organization.id, { status: 'live' });
      liveRestaurantId = live.id;
      const version = (number: number) =>
        admin.db
          .insert(schema.menuVersions)
          .values({
            organizationId: organization.id,
            restaurantId: live.id,
            version: number,
            snapshot: { schema: 1, version: number },
            snapshotHash: `hash-${String(number)}`,
            aiContextText: '',
            stats: {},
            publishedByUserId: user.id,
            publishedAt: new Date(),
          })
          .returning();
      olderVersionId = (await version(1))[0]?.id ?? '';
      publishedVersionId = (await version(2))[0]?.id ?? '';
      await admin.db
        .update(schema.restaurants)
        .set({ publishedMenuVersionId: publishedVersionId })
        .where(eq(schema.restaurants.id, live.id));
      // Organisation A's restaurant stays a draft, and its menu version is not its published one.
    });

    it('shows only the published menu version of a live restaurant', async () => {
      const ids = await withPublic(app.db, async (tx) =>
        (await tx.select({ id: schema.menuVersions.id }).from(schema.menuVersions)).map(
          (row) => row.id,
        ),
      );
      expect(ids).toEqual([publishedVersionId]);
      expect(ids).not.toContain(olderVersionId);
      expect(ids).not.toContain(orgA.menuVersionId);
    });

    it('shows live restaurants through the public view only, and only inside withPublic()', async () => {
      const inside = await withPublic(app.db, (tx) =>
        tx.execute<{ id: string }>(sql`select id from public_restaurants`),
      );
      expect(inside.rows.map((row) => row.id)).toEqual([liveRestaurantId]);

      const outside = await app.db.execute(sql`select id from public_restaurants`);
      expect(outside.rows).toEqual([]);

      // The table behind the view, and every other tenant table, stays closed.
      expect(await withPublic(app.db, (tx) => count(tx, 'restaurants'))).toBe(0);
      expect(await withPublic(app.db, (tx) => count(tx, 'menu_items'))).toBe(0);
      const columns = Object.keys(inside.rows[0] ?? {});
      expect(columns).toEqual(['id']);
    });

    it("resolves a restaurant's organisation before a tenant is known, and nothing else", async () => {
      const lookup = async (id: string) => {
        const { rows } = await app.db.execute<{ org: string | null }>(
          sql`select restaurant_org(${id}) as org`,
        );
        return rows[0]?.org;
      };
      expect(await lookup(orgA.restaurantId)).toBe(orgA.organizationId);
      expect(await lookup('0199f2a4-5b6c-7d8e-9f01-23456789abcd')).toBeNull();
    });
  });

  describe('audit log and feature flags', () => {
    it('is append-only: entries can be added for the current organisation, never changed', async () => {
      const add = (organizationId: string | null) =>
        sql`insert into audit_logs (organization_id, actor_type, action) values (${organizationId}, 'user', 'test.audit')`;
      const asA = (statement: ReturnType<typeof add>) =>
        pgCode(probe(app.db, orgA.organizationId, (tx) => tx.execute(statement)));

      expect(await asA(add(orgA.organizationId))).toBeUndefined();
      expect(await asA(add(orgB))).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await asA(add(null))).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await asA(sql`update audit_logs set action = 'tampered'`)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(await asA(sql`delete from audit_logs`)).toBe(INSUFFICIENT_PRIVILEGE);

      // With no tenant set, only an entry without an organisation is accepted (system events).
      expect(await pgCode(app.db.execute(add(orgA.organizationId)))).toBe(INSUFFICIENT_PRIVILEGE);
      const system = await pgCode(
        app.db.transaction(async (tx) => {
          await tx.execute(add(null));
          throw new Rollback();
        }),
      );
      expect(system).toBe('unknown'); // the Rollback sentinel: the insert itself succeeded
    });

    it('shows an organisation its own flags plus the global defaults', async () => {
      const key = 'ai.disabled';
      await admin.db.insert(schema.featureFlags).values([
        { key, organizationId: null, enabled: false },
        { key, organizationId: orgB, enabled: true },
      ]);
      const flags = (organizationId: string) =>
        probe(app.db, organizationId, async (tx) =>
          (
            await tx
              .select({
                org: schema.featureFlags.organizationId,
                enabled: schema.featureFlags.enabled,
              })
              .from(schema.featureFlags)
              .where(eq(schema.featureFlags.key, key))
          ).map((row) => (row.org === null ? 'global' : 'own') + ':' + String(row.enabled)),
        );
      expect(await flags(orgA.organizationId)).toEqual(['global:false']);
      expect((await flags(orgB)).sort()).toEqual(['global:false', 'own:true']);

      // The same key cannot be defined twice for one scope, including the global one.
      const duplicate = admin.db
        .insert(schema.featureFlags)
        .values({ key, organizationId: null, enabled: true });
      expect(await pgCode(duplicate)).toBe('23505');
    });
  });

  describe('BaseTenantRepository', () => {
    class RestaurantRepository extends BaseTenantRepository {
      async slugs() {
        return (
          await this.tx.select({ slug: schema.restaurants.slug }).from(schema.restaurants)
        ).map((row) => row.slug);
      }

      organization() {
        return this.organizationId;
      }
    }
    const repository = new RestaurantRepository();

    it('refuses to run outside withTenant()', async () => {
      await expect(repository.slugs()).rejects.toThrow(MissingTenantContextError);
    });

    it("reads through the tenant's transaction", async () => {
      const [slugs, organization] = await withTenant(app.db, orgA.organizationId, async () => [
        await repository.slugs(),
        repository.organization(),
      ]);
      expect(slugs).toHaveLength(1);
      expect(organization).toBe(orgA.organizationId);
      expect(await withTenant(app.db, orgB, () => repository.slugs())).toEqual([]);
    });
  });

  describe('privileges (ADR-021)', () => {
    // What each role may do, table by table. This mirrors drizzle/0003_grants_and_rls.sql on
    // purpose: a new table has to be added to both, or this test fails.
    const CRUD = 'DELETE,INSERT,SELECT,UPDATE';
    const fullTenant = [
      'assets', 'chat_conversations', 'chat_messages', 'dining_areas', 'dining_tables', 'glossary_terms',
      'import_job_pages', 'import_jobs', 'kitchen_stations', 'menu_categories', 'menu_item_allergens',
      'menu_item_ingredients', 'menu_item_modifier_groups', 'menu_item_variants', 'menu_items',
      'modifier_groups', 'modifier_options', 'notification_optins', 'order_rounds', 'restaurant_faq',
      'restaurants', 'session_item_shares', 'session_items', 'session_participants', 'staff_devices',
      'table_sessions', 'waiter_calls',
    ]; // prettier-ignore
    const expected: Record<string, { app_runtime: string; app_worker: string }> = {
      ...Object.fromEntries(
        fullTenant.map((table) => [table, { app_runtime: CRUD, app_worker: CRUD }]),
      ),
      ...Object.fromEntries(
        ['account', 'invitation', 'session', 'two_factor', 'verification'].map((table) => [
          table,
          { app_runtime: CRUD, app_worker: '' },
        ]),
      ),
      ...Object.fromEntries(
        ['member', 'organization', 'user'].map((table) => [
          table,
          { app_runtime: CRUD, app_worker: 'SELECT' },
        ]),
      ),
      diner_devices: { app_runtime: 'INSERT,SELECT,UPDATE', app_worker: '' },
      exchange_rate_history: { app_runtime: 'INSERT,SELECT', app_worker: 'INSERT,SELECT' },
      menu_versions: { app_runtime: 'INSERT,SELECT', app_worker: 'INSERT,SELECT' },
      bill_snapshots: { app_runtime: 'INSERT,SELECT', app_worker: 'INSERT,SELECT' },
      payments: { app_runtime: 'INSERT,SELECT,UPDATE', app_worker: 'SELECT' },
      discounts: { app_runtime: 'INSERT,SELECT,UPDATE', app_worker: 'SELECT' },
      audit_logs: { app_runtime: 'INSERT,SELECT', app_worker: 'INSERT,SELECT' },
      outbox_events: { app_runtime: 'INSERT,SELECT', app_worker: '' },
      menu_events: { app_runtime: 'INSERT,SELECT', app_worker: 'INSERT,SELECT' },
      daily_metrics: { app_runtime: 'SELECT', app_worker: CRUD },
      daily_dish_metrics: { app_runtime: 'SELECT', app_worker: CRUD },
      insight_reports: { app_runtime: 'SELECT', app_worker: CRUD },
      chat_message_labels: { app_runtime: 'SELECT', app_worker: CRUD },
      subscriptions: { app_runtime: 'SELECT', app_worker: 'SELECT' },
      subscription_payments: { app_runtime: 'SELECT', app_worker: 'SELECT' },
      feature_flags: { app_runtime: 'SELECT', app_worker: 'SELECT' },
      usage_counters: { app_runtime: 'INSERT,SELECT,UPDATE', app_worker: 'INSERT,SELECT,UPDATE' },
    };

    it('grants each role exactly the documented privileges on every table', async () => {
      const { rows } = await catalog.query<{ name: string; role: string; privileges: string }>(`
        select c.relname::text as name, r.rolname::text as role,
               coalesce((
                 select string_agg(p, ',' order by p)
                 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
                 where has_table_privilege(r.oid, c.oid, p)
               ), '') as privileges
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          cross join pg_roles r
         where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
           and r.rolname in ('app_runtime', 'app_worker')`);
      const actual: Record<string, Record<string, string>> = {};
      for (const row of rows) (actual[row.name] ??= {})[row.role] = row.privileges;
      expect(actual).toEqual(expected);
    });

    it('lets the API set dispatched_at on an outbox row and nothing else', async () => {
      const set = (assignment: ReturnType<typeof sql>) =>
        pgCode(
          probe(app.db, orgA.organizationId, (tx) =>
            tx.execute(sql`update outbox_events set ${assignment}`),
          ),
        );
      expect(await set(sql`dispatched_at = now()`)).toBeUndefined();
      expect(await set(sql`payload = '{}'`)).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('gives the admin role every table, and nobody a partition', async () => {
      const { rows } = await catalog.query<{ name: string }>(`
        select c.relname::text as name
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
           and not (has_table_privilege('app_admin', c.oid, 'SELECT')
                and has_table_privilege('app_admin', c.oid, 'INSERT')
                and has_table_privilege('app_admin', c.oid, 'UPDATE')
                and has_table_privilege('app_admin', c.oid, 'DELETE'))`);
      expect(rows).toEqual([]);

      const { rows: open } = await catalog.query<{ name: string }>(`
        select c.relname::text as name
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relispartition and c.relkind = 'r'
           and (has_table_privilege('app_runtime', c.oid, 'SELECT')
             or has_table_privilege('app_worker', c.oid, 'SELECT')
             or has_table_privilege('app_admin', c.oid, 'SELECT')
             or not c.relrowsecurity)`);
      expect(open).toEqual([]);
    });

    it('pins the search path of every SECURITY DEFINER function and hides it from PUBLIC', async () => {
      const { rows } = await catalog.query<{ name: string; pinned: boolean; public: boolean }>(`
        select p.proname::text as name,
               coalesce(p.proconfig::text like '%search_path=%', false) as pinned,
               has_function_privilege('public', p.oid, 'EXECUTE') as public
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef
         order by 1`);
      expect(rows.map((row) => row.name)).toEqual(['is_published_menu_version', 'restaurant_org']);
      expect(rows.filter((row) => !row.pinned || row.public)).toEqual([]);
    });

    it('lets no application role change the schema', async () => {
      for (const handle of [app, worker, admin]) {
        expect(await pgCode(handle.db.execute(sql`create table sneaky (id int)`))).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
        expect(
          await pgCode(handle.db.execute(sql`alter table restaurants disable row level security`)),
        ).toBe(INSUFFICIENT_PRIVILEGE);
        expect(await pgCode(handle.db.execute(sql`select ensure_menu_events_partitions(1)`))).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
      }
    });
  });
});
