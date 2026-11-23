import { ApplicationConfig } from '@nestjs/core';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  detectIntegrationRuntime,
  startPostgres,
  startValkey,
  type StartedService,
} from '@radd/config/testing';
import { createDb, type DbHandle, RestaurantsRepository, withTenant } from '@radd/db';
import { createTestDatabase, type TestDatabase } from '@radd/db/testing';
import { MemoryMailer } from '@radd/mail';
import { type MemberRole, REQUEST_ID_HEADER, uuidv7 } from '@radd/shared';

import { createApp } from '../src/app.factory';
import { latestCode, randomIp, TestBrowser, uniqueEmail } from './support/auth-client';
import { testEnv } from './support/env';
import { TestRoutesModule } from './support/test-routes.module';
import { AuthzGuard } from '../src/authz/authz.guard';
import { TenantTransactionInterceptor } from '../src/authz/tenant-transaction.interceptor';
import { IdempotencyInterceptor } from '../src/idempotency/idempotency.interceptor';
import { deviceCookieSpec, hashDeviceToken, newDeviceToken } from '../src/staff/device-cookie';
import { ActorThrottlerGuard } from '../src/throttling/actor-throttler.guard';

const runtime = await detectIntegrationRuntime(['postgres', 'valkey']);

const CONSOLE = 'http://localhost:3001';
const PASSWORD = 'correct horse battery';
/** The test env's API is plain HTTP, so the device cookie is `radd_device` (ADR-026). */
const DEVICE_COOKIE_NAME = deviceCookieSpec(testEnv().BETTER_AUTH_URL).name;

interface Account {
  email: string;
  userId: string;
  client: TestBrowser;
}

/** Who calls, in the column order of the expected table (SECURITY §3). */
const CALLERS = [
  'owner',
  'manager',
  'staff',
  'kitchen',
  'outsider',
  'stranger',
  'anonymous',
] as const;
type Caller = (typeof CALLERS)[number];

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Row {
  name: string;
  method: Method;
  /** Built per call so every write is unique. */
  url: () => string;
  body?: () => Record<string, unknown>;
  /** owner, manager, staff, kitchen, outsider, stranger, anonymous. */
  expected: readonly [number, number, number, number, number, number, number];
}

let slugCounter = 0;
const nextSlug = () => {
  slugCounter += 1;
  return `authz-${String(Date.now()).slice(-6)}-${String(slugCounter)}`;
};

describe.skipIf(!runtime.ready)('authorisation layer (ADR-024, ADR-025)', () => {
  let postgres: StartedService;
  let valkey: StartedService;
  let database: TestDatabase;
  let sql: DbHandle;
  let admin: DbHandle;
  let runtimeDb: DbHandle;
  let app: NestFastifyApplication;
  const mailer = new MemoryMailer();

  const query = async <T>(text: string, values: unknown[] = []): Promise<T[]> =>
    (await sql.pool.query(text, values)).rows as T[];

  const key = () => ({ 'idempotency-key': uuidv7() });

  async function signUp(label: string): Promise<Account> {
    const email = uniqueEmail(label);
    const client = new TestBrowser(app, { origin: CONSOLE, ip: randomIp() });
    const res = await client.post('/v1/auth/sign-up/email', {
      name: label,
      email,
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(200);
    const otp = await latestCode(app, mailer, email);
    expect((await client.post('/v1/auth/email-otp/verify-email', { email, otp })).statusCode).toBe(
      200,
    );
    const [row] = await query<{ id: string }>('select id from "user" where email = $1', [email]);
    if (!row) throw new Error('no user row');
    return { email, userId: row.id, client };
  }

  async function createOrg(account: Account, name: string): Promise<{ id: string }> {
    const res = await account.client.post('/v1/organizations', { name }, key());
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>();
  }

  async function join(account: Account, organizationId: string, role: MemberRole) {
    await query('insert into member (id, user_id, organization_id, role) values ($1, $2, $3, $4)', [
      uuidv7(),
      account.userId,
      organizationId,
      role,
    ]);
    const res = await account.client.post('/v1/auth/organization/set-active', { organizationId });
    expect(res.statusCode).toBe(200);
  }

  async function createRestaurant(account: Account, slug = nextSlug()): Promise<{ id: string }> {
    const res = await account.client.post('/v1/restaurants', { name: { en: slug }, slug }, key());
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ id: string }>();
  }

  async function team(label: string) {
    const owner = await signUp(`${label}-owner`);
    const org = await createOrg(owner, `${label} House`);
    const [manager, staff, kitchen, outsider, stranger] = await Promise.all(
      ['manager', 'staff', 'kitchen', 'outsider', 'stranger'].map((role) =>
        signUp(`${label}-${role}`),
      ),
    );
    if (!manager || !staff || !kitchen || !outsider || !stranger) throw new Error('sign-up failed');
    await join(manager, org.id, 'manager');
    await join(staff, org.id, 'staff');
    await join(kitchen, org.id, 'kitchen');
    // Pointed at the organisation without belonging to it, e.g. after being removed.
    await query('update session set active_organization_id = $1 where user_id = $2', [
      org.id,
      outsider.userId,
    ]);
    return { org, owner, manager, staff, kitchen, outsider, stranger };
  }

  type Team = Awaited<ReturnType<typeof team>>;

  async function call(
    t: Team,
    caller: Caller,
    method: Method,
    url: string,
    body?: Record<string, unknown>,
  ) {
    const headers = method === 'GET' ? {} : key();
    if (caller === 'anonymous') {
      return app.inject({
        method,
        url,
        headers: { origin: CONSOLE, ...headers },
        remoteAddress: randomIp(),
        ...(body ? { payload: body } : {}),
      });
    }
    const { client } = t[caller];
    if (method === 'GET') return client.get(url);
    if (method === 'PATCH') return client.patch(url, body, headers);
    if (method === 'PUT') return client.put(url, body, headers);
    if (method === 'DELETE') return client.delete(url, headers);
    return client.post(url, body, headers);
  }

  /**
   * Runs `run` while the account's sessions are PIN sessions (ADR-026). The flag is server-only,
   * so it is written through the admin connection; a PIN session is only valid when bound to a
   * registered device whose cookie the browser sends, so one is registered in the account's
   * active organisation and its cookie handed to the account's browser. Forging the session
   * rather than switching by PIN also covers what the switch itself refuses: a manager's PIN
   * session must still hold nothing. `staff.int.test.ts` covers the real switch.
   */
  async function withPinSession<T>(account: Account, run: () => Promise<T>): Promise<T> {
    const [active] = await query<{ organizationId: string }>(
      `select active_organization_id as "organizationId" from session
        where user_id = $1 and active_organization_id is not null limit 1`,
      [account.userId],
    );
    if (!active) throw new Error('withPinSession needs a session in an organisation');
    let [restaurant] = await query<{ id: string }>(
      'select id from restaurants where organization_id = $1 limit 1',
      [active.organizationId],
    );
    if (!restaurant) {
      const slug = nextSlug();
      const created = await withTenant(runtimeDb.db, active.organizationId, () =>
        new RestaurantsRepository().create({ name: { en: slug }, slug }),
      );
      if (!created) throw new Error('could not create a restaurant for the device');
      restaurant = created;
    }
    const token = newDeviceToken();
    const deviceId = uuidv7();
    await query(
      `insert into staff_devices (id, organization_id, restaurant_id, name, token_hash)
       values ($1, $2, $3, 'Test tablet', $4)`,
      [deviceId, active.organizationId, restaurant.id, hashDeviceToken(token)],
    );
    await admin.pool.query(
      'update session set pin_session = true, staff_device_id = $2 where user_id = $1',
      [account.userId, deviceId],
    );
    account.client.jar.set(DEVICE_COOKIE_NAME, token);
    try {
      return await run();
    } finally {
      account.client.jar.delete(DEVICE_COOKIE_NAME);
      await admin.pool.query(
        'update session set pin_session = false, staff_device_id = null where user_id = $1',
        [account.userId],
      );
    }
  }

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([startPostgres(), startValkey()]);
    database = await createTestDatabase(postgres.url);
    sql = createDb({ url: database.urls.superuser, max: 2 });
    admin = createDb({ url: database.urls.admin, max: 2 });
    runtimeDb = createDb({ url: database.urls.runtime, max: 2 });
    app = await createApp(
      testEnv({
        DATABASE_URL: database.urls.runtime,
        DATABASE_URL_ADMIN: database.urls.admin,
        REDIS_URL: valkey.url,
        CONSOLE_PUBLIC_URL: CONSOLE,
      }),
      { mailer, auth: { rateLimit: false, codeRequestLimit: false }, imports: [TestRoutesModule] },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([sql.close(), admin.close(), runtimeDb.close()]);
    await database.drop();
    await Promise.all([postgres.stop(), valkey.stop()]);
  });

  describe('the console endpoint × caller matrix (SECURITY §3)', () => {
    it('answers every existing console endpoint with the expected status', async () => {
      const t = await team('matrix');
      const restaurantA = await createRestaurant(t.owner);
      const [staffMember] = await query<{ id: string }>(
        'select id from member where user_id = $1 and organization_id = $2',
        [t.staff.userId, t.org.id],
      );
      if (!staffMember) throw new Error('no staff member row');
      const device = (
        await t.owner.client.post(
          `/v1/restaurants/${restaurantA.id}/staff-devices`,
          { name: 'Matrix tablet' },
          key(),
        )
      ).json<{ id: string }>();

      // prettier-ignore
      const ROWS: readonly Row[] = [
        { name: 'GET /v1/me', method: 'GET', url: () => '/v1/me',
          expected: [200, 200, 200, 200, 200, 200, 401] },
        { name: 'GET /v1/organizations/current', method: 'GET', url: () => '/v1/organizations/current',
          expected: [200, 200, 200, 200, 403, 404, 401] },
        { name: 'PATCH /v1/organizations/current', method: 'PATCH', url: () => '/v1/organizations/current',
          body: () => ({ name: 'Matrix House' }),
          expected: [200, 200, 403, 403, 403, 404, 401] },
        { name: 'GET /v1/organizations/current/members', method: 'GET', url: () => '/v1/organizations/current/members',
          expected: [200, 200, 200, 200, 403, 404, 401] },
        { name: 'POST /v1/invitations (staff)', method: 'POST', url: () => '/v1/invitations',
          body: () => ({ email: uniqueEmail('matrix-staff'), role: 'staff' }),
          expected: [201, 201, 403, 403, 403, 404, 401] },
        { name: 'POST /v1/invitations (manager)', method: 'POST', url: () => '/v1/invitations',
          body: () => ({ email: uniqueEmail('matrix-manager'), role: 'manager' }),
          expected: [201, 403, 403, 403, 403, 404, 401] },
        { name: 'POST /v1/restaurants', method: 'POST', url: () => '/v1/restaurants',
          body: () => { const slug = nextSlug(); return { name: { en: slug, ar: 'مطعم' }, slug }; },
          expected: [201, 201, 403, 403, 403, 404, 401] },
        { name: 'GET /v1/restaurants', method: 'GET', url: () => '/v1/restaurants',
          expected: [200, 200, 200, 200, 403, 404, 401] },
        { name: 'GET /v1/restaurants/:rid', method: 'GET', url: () => `/v1/restaurants/${restaurantA.id}`,
          expected: [200, 200, 200, 200, 404, 404, 401] },
        { name: 'GET /v1/restaurants/:rid/staff-devices', method: 'GET', url: () => `/v1/restaurants/${restaurantA.id}/staff-devices`,
          expected: [200, 200, 403, 403, 404, 404, 401] },
        { name: 'POST /v1/restaurants/:rid/staff-devices', method: 'POST', url: () => `/v1/restaurants/${restaurantA.id}/staff-devices`,
          body: () => ({ name: 'Bar tablet' }),
          expected: [201, 201, 403, 403, 404, 404, 401] },
        // Revoking twice keeps the first revocation, so one device serves every caller.
        { name: 'DELETE /v1/staff-devices/:id', method: 'DELETE', url: () => `/v1/staff-devices/${device.id}`,
          expected: [200, 200, 403, 403, 403, 404, 401] },
        { name: 'PUT /v1/members/:id/pin', method: 'PUT', url: () => `/v1/members/${staffMember.id}/pin`,
          body: () => ({ pin: '2580' }),
          expected: [204, 204, 403, 403, 403, 404, 401] },
        { name: 'DELETE /v1/members/:id/pin', method: 'DELETE', url: () => `/v1/members/${staffMember.id}/pin`,
          expected: [204, 204, 403, 403, 403, 404, 401] },
        // Public, but nobody here holds the device cookie: the same refusal for everyone.
        { name: 'POST /v1/staff-devices/:id/switch', method: 'POST', url: () => `/v1/staff-devices/${device.id}/switch`,
          body: () => ({ memberId: staffMember.id, pin: '2580' }),
          expected: [403, 403, 403, 403, 403, 403, 403] },
        { name: 'GET /v1/admin/orgs', method: 'GET', url: () => '/v1/admin/orgs',
          expected: [403, 403, 403, 403, 403, 403, 401] },
        { name: 'GET /v1/health/live', method: 'GET', url: () => '/v1/health/live',
          expected: [200, 200, 200, 200, 200, 200, 200] },
        // Last: creating an organisation makes it the caller's active one.
        { name: 'POST /v1/organizations', method: 'POST', url: () => '/v1/organizations',
          body: () => ({ name: 'Second House' }),
          expected: [201, 201, 201, 201, 201, 201, 401] },
      ];

      const failures: string[] = [];
      for (const row of ROWS) {
        for (const [index, caller] of CALLERS.entries()) {
          const res = await call(t, caller, row.method, row.url(), row.body?.());
          const expected = row.expected[index];
          if (res.statusCode !== expected) {
            failures.push(
              `${row.name} as ${caller}: ${String(res.statusCode)} ≠ ${String(expected)}`,
            );
          }
          if (res.statusCode >= 400) {
            expect(res.headers['content-type'], row.name).toContain('application/problem+json');
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it('uses the documented problem codes for each refusal', async () => {
      const t = await team('codes');
      const anonymous = await call(t, 'anonymous', 'GET', '/v1/restaurants');
      expect(anonymous.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(
        (
          await call(t, 'staff', 'POST', '/v1/restaurants', { name: { en: 'x' }, slug: nextSlug() })
        ).json(),
      ).toMatchObject({ code: 'FORBIDDEN' });
      expect((await call(t, 'outsider', 'GET', '/v1/restaurants')).json()).toMatchObject({
        code: 'NOT_A_MEMBER',
      });
      expect((await call(t, 'stranger', 'GET', '/v1/restaurants')).json()).toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('restaurant scope', () => {
    it('hides another organisation’s restaurants: 404 by ID, absent from the list', async () => {
      const a = await team('scope-a');
      const ownerB = await signUp('scope-b-owner');
      await createOrg(ownerB, 'Scope B');
      const mine = await createRestaurant(a.owner);
      const theirs = await createRestaurant(ownerB);

      for (const member of [a.owner, a.manager, a.staff, a.kitchen]) {
        const res = await member.client.get(`/v1/restaurants/${theirs.id}`);
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ code: 'NOT_FOUND', detail: 'Restaurant not found' });
        const list = (await member.client.get('/v1/restaurants')).json<{
          items: { id: string }[];
        }>();
        expect(list.items.map((item) => item.id)).toEqual([mine.id]);
      }
      // The same answer for an ID that exists nowhere and one that is not a UUID.
      for (const id of [uuidv7(), 'not-a-uuid', theirs.id]) {
        const res = await a.owner.client.get(`/v1/restaurants/${id}`);
        expect(res.statusCode, id).toBe(404);
        expect(res.json()).toMatchObject({ code: 'NOT_FOUND', detail: 'Restaurant not found' });
      }
      // A deleted restaurant is gone too.
      await query('update restaurants set deleted_at = now() where id = $1', [mine.id]);
      expect((await a.owner.client.get(`/v1/restaurants/${mine.id}`)).statusCode).toBe(404);
    });

    it('acts in the restaurant’s organisation for a member of several organisations', async () => {
      const a = await team('multi-a');
      const ownerB = await signUp('multi-b-owner');
      const orgB = await createOrg(ownerB, 'Multi B');
      const restaurantB = await createRestaurant(ownerB);
      // A's manager also works in B as staff, while A stays their active organisation.
      await query(
        'insert into member (id, user_id, organization_id, role) values ($1, $2, $3, $4)',
        [uuidv7(), a.manager.userId, orgB.id, 'staff'],
      );

      const res = await a.manager.client.get(`/v1/__test/tenant/restaurants/${restaurantB.id}`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        organizationId: orgB.id,
        restaurantId: restaurantB.id,
        rid: restaurantB.id,
      });
      expect((await a.manager.client.get(`/v1/restaurants/${restaurantB.id}`)).statusCode).toBe(
        200,
      );
      // The list follows the active organisation (A), never B's.
      const list = (await a.manager.client.get('/v1/restaurants')).json<{
        items: { id: string }[];
      }>();
      expect(list.items.map((item) => item.id)).not.toContain(restaurantB.id);
    });

    it('lets Row Level Security stop a lookup by another organisation’s ID without the guard', async () => {
      const a = await team('rls-a');
      const ownerB = await signUp('rls-b-owner');
      await createOrg(ownerB, 'RLS B');
      const mine = await createRestaurant(a.owner);
      const theirs = await createRestaurant(ownerB);

      const repository = new RestaurantsRepository();
      const found = await withTenant(runtimeDb.db, a.org.id, async () => ({
        theirs: await repository.findById(theirs.id),
        mine: await repository.findById(mine.id),
      }));
      expect(found.theirs).toBeUndefined();
      expect(found.mine?.id).toBe(mine.id);

      // No organisation filter at all: only the policy stands between org A and B's row.
      const client = await runtimeDb.pool.connect();
      try {
        await client.query('begin');
        await client.query(`select set_config('app.org_id', $1, true)`, [a.org.id]);
        const rows = await client.query<{ id: string }>('select id from restaurants');
        expect(rows.rows.map((row) => row.id)).toEqual([mine.id]);
        const byId = await client.query('select id from restaurants where id = $1', [theirs.id]);
        expect(byId.rows).toEqual([]);
        await client.query('rollback');
      } finally {
        client.release();
      }
    });
  });

  describe('POST /v1/restaurants', () => {
    it('creates a draft, requires an Idempotency-Key and replays it', async () => {
      const t = await team('create');
      const slug = nextSlug();
      const headers = key();
      const body = { name: { en: 'Beit Tayta', ar: 'بيت تيتا' }, slug: slug.toUpperCase() };
      const first = await t.manager.client.post('/v1/restaurants', body, headers);
      expect(first.statusCode).toBe(201);
      expect(first.json()).toMatchObject({
        organizationId: t.org.id,
        slug,
        name: { en: 'Beit Tayta', ar: 'بيت تيتا' },
        status: 'draft',
        defaultLocale: 'en',
        timezone: 'Asia/Beirut',
      });
      // Committed before the response was sent.
      expect(await query('select status from restaurants where slug = $1', [slug])).toEqual([
        { status: 'draft' },
      ]);
      const again = await t.manager.client.post('/v1/restaurants', body, headers);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(again.json()).toEqual(first.json());
      expect(await query('select 1 from restaurants where slug = $1', [slug])).toHaveLength(1);

      const missing = await t.owner.client.post('/v1/restaurants', {
        name: { en: 'x' },
        slug: nextSlug(),
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });

      for (const bad of [
        { name: { en: 'x' }, slug: 'no spaces' },
        { name: {}, slug: nextSlug() },
        { name: { en: 'x' }, slug: nextSlug(), status: 'live' },
        { name: { en: 'x' }, slug: nextSlug(), organizationId: uuidv7() },
      ]) {
        const res = await t.owner.client.post('/v1/restaurants', bad, key());
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
    });

    it('answers 409 on a taken slug without saying whose it is', async () => {
      const a = await team('slug-a');
      const ownerB = await signUp('slug-b-owner');
      await createOrg(ownerB, 'Slug B');
      const slug = nextSlug();
      await createRestaurant(a.owner, slug);
      const res = await ownerB.client.post(
        '/v1/restaurants',
        { name: { en: 'Copy' }, slug },
        key(),
      );
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'CONFLICT', detail: 'This slug is already taken' });
      expect(res.body).not.toContain(a.org.id);
      expect(res.body).not.toContain('slug-a');
    });

    it('pages the list with a cursor', async () => {
      const t = await team('pages');
      const created = [];
      for (let i = 0; i < 3; i += 1) created.push(await createRestaurant(t.owner));
      const page1 = (await t.staff.client.get('/v1/restaurants?limit=2')).json<{
        items: { id: string }[];
        nextCursor: string | null;
      }>();
      expect(page1.items.map((item) => item.id)).toEqual(created.slice(0, 2).map((r) => r.id));
      expect(page1.nextCursor).toBe(created[1]?.id);
      const page2 = (
        await t.staff.client.get(`/v1/restaurants?limit=2&cursor=${page1.nextCursor ?? ''}`)
      ).json<{ items: { id: string }[]; nextCursor: string | null }>();
      expect(page2).toEqual({
        items: [expect.objectContaining({ id: created[2]?.id })],
        nextCursor: null,
      });
    });
  });

  describe('the request transaction and context', () => {
    it('rolls back what a handler wrote when it fails', async () => {
      const t = await team('rollback');
      const slug = nextSlug();
      const res = await t.owner.client.post('/v1/__test/tenant/write-then-throw', { slug });
      expect(res.statusCode).toBe(409);
      // The handler did write a row: the message names its ID.
      expect(res.json<{ detail: string }>().detail).toMatch(/^wrote [0-9a-f-]{36}, then failed$/);
      expect(await query('select 1 from restaurants where slug = $1', [slug])).toHaveLength(0);
    });

    it('exposes the actor, tenant and request ID to services', async () => {
      const t = await team('context');
      const res = await t.kitchen.client.get('/v1/__test/tenant/context');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        actor: {
          kind: 'member',
          userId: t.kitchen.userId,
          organizationId: t.org.id,
          role: 'kitchen',
          pinSession: false,
        },
        organizationId: t.org.id,
        restaurantId: null,
        requestId: res.headers[REQUEST_ID_HEADER],
        sameActor: true,
      });
    });

    it('runs the throttler before this guard and idempotency outside the transaction', () => {
      const config = app.get(ApplicationConfig);
      const guards = config.getGlobalGuards();
      const throttler = guards.findIndex((guard) => guard instanceof ActorThrottlerGuard);
      const authz = guards.findIndex((guard) => guard instanceof AuthzGuard);
      expect(throttler).toBeGreaterThanOrEqual(0);
      expect(authz).toBeGreaterThan(throttler);

      const interceptors = config.getGlobalInterceptors();
      const idempotency = interceptors.findIndex((i) => i instanceof IdempotencyInterceptor);
      const tenant = interceptors.findIndex((i) => i instanceof TenantTransactionInterceptor);
      expect(idempotency).toBeGreaterThanOrEqual(0);
      expect(tenant).toBeGreaterThan(idempotency);
    });
  });

  describe('default deny', () => {
    it('refuses a route that declares no access policy, signed in or not', async () => {
      const t = await team('undeclared');
      const signedIn = await t.owner.client.get('/v1/__test/undeclared');
      expect(signedIn.statusCode).toBe(403);
      expect(signedIn.json()).toMatchObject({ code: 'FORBIDDEN' });
      expect(signedIn.body).not.toContain('leaked');
      const anonymous = await app.inject({ method: 'GET', url: '/v1/__test/undeclared' });
      expect(anonymous.statusCode).toBe(403);
    });

    it('still applies rate limits to refused requests', async () => {
      const ip = randomIp();
      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/__test/undeclared/limited',
          remoteAddress: ip,
        });
        statuses.push(res.statusCode);
      }
      expect(statuses).toEqual([403, 403, 403, 429]);
    });
  });

  describe('PIN sessions (ADR-026)', () => {
    it('keep only floor and kitchen work: no organisation or team actions', async () => {
      const t = await team('pin');
      const restaurant = await createRestaurant(t.owner);

      await withPinSession(t.staff, async () => {
        expect((await t.staff.client.get('/v1/restaurants')).statusCode).toBe(200);
        expect((await t.staff.client.get(`/v1/restaurants/${restaurant.id}`)).statusCode).toBe(200);
        expect((await t.staff.client.get('/v1/me')).statusCode).toBe(200);
        for (const res of [
          await t.staff.client.get('/v1/organizations/current'),
          await t.staff.client.get('/v1/organizations/current/members'),
          await t.staff.client.patch('/v1/organizations/current', { name: 'PIN' }),
          await t.staff.client.post(
            '/v1/invitations',
            { email: uniqueEmail('pin'), role: 'staff' },
            key(),
          ),
        ]) {
          expect(res.statusCode).toBe(403);
          expect(res.json()).toMatchObject({ code: 'FORBIDDEN' });
        }
        const created = await t.staff.client.post('/v1/organizations', { name: 'PIN org' }, key());
        expect(created.statusCode).toBe(403);
      });

      // A PIN session of a manager holds nothing at all (only staff and kitchen may use PINs).
      await withPinSession(t.manager, async () => {
        expect((await t.manager.client.get('/v1/restaurants')).statusCode).toBe(403);
        expect(
          (await t.manager.client.patch('/v1/organizations/current', { name: 'x' })).statusCode,
        ).toBe(403);
        expect(
          (
            await t.manager.client.post(
              '/v1/invitations',
              { email: uniqueEmail('p'), role: 'staff' },
              key(),
            )
          ).statusCode,
        ).toBe(403);
      });

      // Back to normal once the flag is gone.
      expect((await t.staff.client.get('/v1/organizations/current')).statusCode).toBe(200);
    });

    it('are confined to the organisation they were opened in', async () => {
      const a = await team('pin-scope');
      const ownerB = await signUp('pin-scope-b');
      const orgB = await createOrg(ownerB, 'PIN B');
      const restaurantB = await createRestaurant(ownerB);
      await query(
        'insert into member (id, user_id, organization_id, role) values ($1, $2, $3, $4)',
        [uuidv7(), a.staff.userId, orgB.id, 'staff'],
      );
      expect((await a.staff.client.get(`/v1/restaurants/${restaurantB.id}`)).statusCode).toBe(200);
      await withPinSession(a.staff, async () => {
        expect((await a.staff.client.get(`/v1/restaurants/${restaurantB.id}`)).statusCode).toBe(
          404,
        );
      });
    });
  });

  describe('a suspended organisation', () => {
    it('allows reads and refuses mutations', async () => {
      const t = await team('suspended');
      const restaurant = await createRestaurant(t.owner);
      await query(`update organization set status = 'suspended' where id = $1`, [t.org.id]);

      for (const member of [t.owner, t.staff]) {
        expect((await member.client.get('/v1/restaurants')).statusCode).toBe(200);
        expect((await member.client.get(`/v1/restaurants/${restaurant.id}`)).statusCode).toBe(200);
        expect((await member.client.get('/v1/organizations/current')).statusCode).toBe(200);
      }
      for (const res of [
        await t.owner.client.post(
          '/v1/restaurants',
          { name: { en: 'x' }, slug: nextSlug() },
          key(),
        ),
        await t.manager.client.post(
          '/v1/restaurants',
          { name: { en: 'x' }, slug: nextSlug() },
          key(),
        ),
        await t.owner.client.patch('/v1/organizations/current', { name: 'Back' }),
        await t.owner.client.post('/v1/__test/tenant/write-then-throw', { slug: nextSlug() }),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(res.json()).toMatchObject({ code: 'ORG_SUSPENDED' });
      }
      // Refusing by role still comes first for callers who could never do it.
      const staff = await t.staff.client.post(
        '/v1/restaurants',
        { name: { en: 'x' }, slug: nextSlug() },
        key(),
      );
      expect(staff.json()).toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
