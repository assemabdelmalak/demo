import { createHash } from 'node:crypto';

import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  detectIntegrationRuntime,
  startPostgres,
  startValkey,
  type StartedService,
} from '@radd/config/testing';
import { createDb, type DbHandle } from '@radd/db';
import { createTestDatabase, type TestDatabase } from '@radd/db/testing';
import { MemoryMailer } from '@radd/mail';
import { type MemberRole, uuidv7 } from '@radd/shared';

import { createApp } from '../src/app.factory';
import { latestCode, randomIp, setCookies, TestBrowser, uniqueEmail } from './support/auth-client';
import { testEnv } from './support/env';
import { deviceCookieSpec } from '../src/staff/device-cookie';
import { PinHasher } from '../src/staff/pin-hasher';
import {
  DEFAULT_PIN_LOCKOUT,
  PinLockout,
  PinLockoutUnavailableError,
} from '../src/staff/pin-lockout';

const runtime = await detectIntegrationRuntime(['postgres', 'valkey']);

const CONSOLE = 'http://localhost:3001';
const PASSWORD = 'correct horse battery';
const DEVICE_COOKIE = deviceCookieSpec(testEnv().BETTER_AUTH_URL).name;
/** Short enough to wait out in a test; production locks for 5 minutes (ADR-026). */
const LOCK_MS = 500;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
/** Better Auth's session cookie under APP_ENV=test (ADR-023). */
const sessionCookie = 'radd-test.session_token';

interface Account {
  email: string;
  userId: string;
  client: TestBrowser;
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe.skipIf(!runtime.ready)('staff devices and PIN sessions (ADR-026)', () => {
  let postgres: StartedService;
  let valkey: StartedService;
  let database: TestDatabase;
  let sql: DbHandle;
  let app: NestFastifyApplication;
  const mailer = new MemoryMailer();

  const query = async <T>(text: string, values: unknown[] = []): Promise<T[]> =>
    (await sql.pool.query(text, values)).rows as T[];
  const key = () => ({ 'idempotency-key': uuidv7() });
  const browser = () => new TestBrowser(app, { origin: CONSOLE, ip: randomIp() });

  let slugCounter = 0;
  const nextSlug = () => {
    slugCounter += 1;
    return `staff-${String(Date.now()).slice(-6)}-${String(slugCounter)}`;
  };

  async function signUp(label: string): Promise<Account> {
    const email = uniqueEmail(label);
    const client = browser();
    expect(
      (await client.post('/v1/auth/sign-up/email', { name: label, email, password: PASSWORD }))
        .statusCode,
    ).toBe(200);
    const otp = await latestCode(app, mailer, email);
    expect((await client.post('/v1/auth/email-otp/verify-email', { email, otp })).statusCode).toBe(
      200,
    );
    const [row] = await query<{ id: string }>('select id from "user" where email = $1', [email]);
    if (!row) throw new Error('no user row');
    return { email, userId: row.id, client };
  }

  async function join(account: Account, organizationId: string, role: MemberRole) {
    const id = uuidv7();
    await query('insert into member (id, user_id, organization_id, role) values ($1, $2, $3, $4)', [
      id,
      account.userId,
      organizationId,
      role,
    ]);
    const res = await account.client.post('/v1/auth/organization/set-active', { organizationId });
    expect(res.statusCode).toBe(200);
    return id;
  }

  /** An organisation with a restaurant and one member per role; member IDs included. */
  async function team(label: string) {
    const owner = await signUp(`${label}-owner`);
    const created = await owner.client.post('/v1/organizations', { name: `${label} House` }, key());
    expect(created.statusCode).toBe(201);
    const org = created.json<{ id: string }>();
    const slug = nextSlug();
    const restaurant = (
      await owner.client.post('/v1/restaurants', { name: { en: slug }, slug }, key())
    ).json<{ id: string }>();
    const [manager, staff, kitchen] = await Promise.all(
      ['manager', 'staff', 'kitchen'].map((role) => signUp(`${label}-${role}`)),
    );
    if (!manager || !staff || !kitchen) throw new Error('sign-up failed');
    const members = {
      manager: await join(manager, org.id, 'manager'),
      staff: await join(staff, org.id, 'staff'),
      kitchen: await join(kitchen, org.id, 'kitchen'),
    };
    const [ownerRow] = await query<{ id: string }>(
      'select id from member where user_id = $1 and organization_id = $2',
      [owner.userId, org.id],
    );
    if (!ownerRow) throw new Error('no owner member');
    return { org, restaurant, owner, manager, staff, kitchen, members, ownerMemberId: ownerRow.id };
  }

  type Team = Awaited<ReturnType<typeof team>>;

  /** A fresh browser where the manager signs in and registers it as the restaurant's tablet. */
  async function tablet(t: Team): Promise<{ client: TestBrowser; deviceId: string }> {
    const client = browser();
    const signIn = await client.post('/v1/auth/sign-in/email', {
      email: t.manager.email,
      password: PASSWORD,
    });
    expect(signIn.statusCode).toBe(200);
    const res = await client.post(
      `/v1/restaurants/${t.restaurant.id}/staff-devices`,
      { name: 'Pass tablet' },
      key(),
    );
    expect(res.statusCode, res.body).toBe(201);
    return { client, deviceId: res.json<{ id: string }>().id };
  }

  async function setPin(t: Team, memberId: string, pin: string) {
    const res = await t.manager.client.put(`/v1/members/${memberId}/pin`, { pin }, key());
    expect(res.statusCode, res.body).toBe(204);
  }

  const switchTo = (client: TestBrowser, deviceId: string, memberId: string, pin: string) =>
    client.post(`/v1/staff-devices/${deviceId}/switch`, { memberId, pin });

  const sessionRow = async (token: string | undefined) => {
    const [row] = await query<{
      id: string;
      user_id: string;
      pin_session: boolean;
      staff_device_id: string | null;
      created_at: Date;
      expires_at: Date;
    }>(
      `select id, user_id, pin_session, staff_device_id, created_at, expires_at
         from session where token = $1`,
      [(token ?? '').split('.')[0]],
    );
    return row;
  };

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([startPostgres(), startValkey()]);
    database = await createTestDatabase(postgres.url);
    sql = createDb({ url: database.urls.superuser, max: 2 });
    app = await createApp(
      testEnv({
        DATABASE_URL: database.urls.runtime,
        DATABASE_URL_ADMIN: database.urls.admin,
        REDIS_URL: valkey.url,
        CONSOLE_PUBLIC_URL: CONSOLE,
      }),
      {
        mailer,
        auth: { rateLimit: false, codeRequestLimit: false },
        staff: { pinLockout: { lockMs: LOCK_MS } },
      },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await sql.close();
    await database.drop();
    await Promise.all([postgres.stop(), valkey.stop()]);
  });

  describe('device registration', () => {
    it('sets a host-only HttpOnly cookie and stores only the token hash', async () => {
      const t = await team('register');
      const idempotency = key();
      const res = await t.manager.client.post(
        `/v1/restaurants/${t.restaurant.id}/staff-devices`,
        { name: 'Bar tablet' },
        idempotency,
      );
      expect(res.statusCode).toBe(201);
      const cookie = setCookies(res).find((c) => c.name === DEVICE_COOKIE);
      if (!cookie) throw new Error('no device cookie');
      const attributes = cookie.attributes.map((a) => a.toLowerCase());
      expect(attributes).toEqual(expect.arrayContaining(['httponly', 'path=/v1', 'samesite=lax']));
      // Host-only: no Domain attribute, so only the API host ever receives it.
      expect(attributes.some((a) => a.startsWith('domain='))).toBe(false);
      expect(res.body).not.toContain(cookie.value);
      const device = res.json<{ id: string; name: string; revokedAt: string | null }>();
      expect(device).toMatchObject({ name: 'Bar tablet', revokedAt: null });

      const [row] = await query<{ token_hash: string }>(
        'select token_hash from staff_devices where id = $1',
        [device.id],
      );
      expect(row?.token_hash).toBe(createHash('sha256').update(cookie.value).digest('hex'));

      // A replay returns the device and never a second cookie.
      const replay = await t.manager.client.post(
        `/v1/restaurants/${t.restaurant.id}/staff-devices`,
        { name: 'Bar tablet' },
        idempotency,
      );
      expect(replay.statusCode).toBe(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(setCookies(replay).some((c) => c.name === DEVICE_COOKIE)).toBe(false);

      const list = await t.owner.client.get(`/v1/restaurants/${t.restaurant.id}/staff-devices`);
      expect(list.statusCode).toBe(200);
      expect(list.json<{ items: { id: string }[] }>().items.map((d) => d.id)).toContain(device.id);
      expect(list.body).not.toMatch(/token/i);
    });
  });

  describe('member PINs', () => {
    it('are set for staff and kitchen only, hashed with argon2id and never returned', async () => {
      const t = await team('pins');
      await setPin(t, t.members.staff, '2580');
      await setPin(t, t.members.kitchen, '147036');
      const [row] = await query<{ pin_hash: string }>('select pin_hash from member where id = $1', [
        t.members.staff,
      ]);
      expect(row?.pin_hash).toMatch(/^\$argon2id\$/);
      expect(row?.pin_hash).not.toContain('2580');

      // Only staff and kitchen use PINs, and a manager manages neither owners nor managers.
      for (const [client, target] of [
        [t.manager.client, t.members.manager],
        [t.manager.client, t.ownerMemberId],
        [t.owner.client, t.members.manager],
        [t.staff.client, t.members.kitchen],
        [t.kitchen.client, t.members.kitchen],
      ] as const) {
        const res = await client.put(`/v1/members/${target}/pin`, { pin: '2580' }, key());
        expect(res.statusCode).toBe(403);
      }
      for (const pin of ['1234', '0000', '1212', '12a4', '123']) {
        const res = await t.manager.client.put(
          `/v1/members/${t.members.staff}/pin`,
          { pin },
          key(),
        );
        expect(res.statusCode, pin).toBe(400);
        expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
      expect(
        (await t.manager.client.put(`/v1/members/${uuidv7()}/pin`, { pin: '2580' }, key()))
          .statusCode,
      ).toBe(404);

      const members = await t.owner.client.get('/v1/organizations/current/members');
      expect(members.statusCode).toBe(200);
      expect(members.body).not.toMatch(/argon2|pinHash|pin_hash/);

      expect((await t.owner.client.delete(`/v1/members/${t.members.staff}/pin`)).statusCode).toBe(
        204,
      );
      const [removed] = await query<{ pin_hash: string | null }>(
        'select pin_hash from member where id = $1',
        [t.members.staff],
      );
      expect(removed?.pin_hash).toBeNull();
    });
  });

  describe('the PIN switch', () => {
    it('opens a 12-hour device session with floor permissions only', async () => {
      const t = await team('switch');
      await setPin(t, t.members.staff, '2580');
      const { client, deviceId } = await tablet(t);
      const managerSession = await sessionRow(client.jar.get(sessionCookie));
      expect(managerSession?.user_id).toBe(t.manager.userId);

      const res = await switchTo(client, deviceId, t.members.staff, '2580');
      expect(res.statusCode, res.body).toBe(200);
      const result = res.json<{ memberId: string; organizationId: string; expiresAt: string }>();
      expect(result).toMatchObject({ memberId: t.members.staff, organizationId: t.org.id });
      expect(Date.parse(result.expiresAt) - Date.now()).toBeLessThanOrEqual(TWELVE_HOURS_MS);
      expect(Date.parse(result.expiresAt) - Date.now()).toBeGreaterThan(TWELVE_HOURS_MS - 60_000);

      // Whoever used the tablet before is signed out of it.
      expect(await query('select 1 from session where id = $1', [managerSession?.id])).toEqual([]);
      const pinSession = await sessionRow(client.jar.get(sessionCookie));
      expect(pinSession).toMatchObject({
        user_id: t.staff.userId,
        pin_session: true,
        staff_device_id: deviceId,
      });
      if (!pinSession) throw new Error('no PIN session');
      expect(pinSession.expires_at.getTime() - pinSession.created_at.getTime()).toBeLessThanOrEqual(
        TWELVE_HOURS_MS,
      );
      const cookie = setCookies(res).find((c) => c.name === sessionCookie);
      expect(cookie?.attributes.map((a) => a.toLowerCase())).toContain('max-age=43200');

      const me = await client.get('/v1/me');
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({
        user: { id: t.staff.userId },
        session: { pinSession: true, staffDeviceId: deviceId },
        isSuperAdmin: false,
      });
      expect((await client.get('/v1/restaurants')).statusCode).toBe(200);
      expect((await client.get(`/v1/restaurants/${t.restaurant.id}`)).statusCode).toBe(200);
      for (const refused of [
        await client.get('/v1/organizations/current'),
        await client.get(`/v1/restaurants/${t.restaurant.id}/staff-devices`),
        await client.put(`/v1/members/${t.members.kitchen}/pin`, { pin: '2580' }, key()),
      ]) {
        expect(refused.statusCode).toBe(403);
      }

      // Under /v1/auth a PIN session may only read itself and sign out.
      const session = await client.get('/v1/auth/get-session');
      expect(session.statusCode).toBe(200);
      expect(session.json()).toMatchObject({ user: { id: t.staff.userId } });
      for (const [path, body] of [
        ['/v1/auth/change-password', { currentPassword: PASSWORD, newPassword: `${PASSWORD}!` }],
        ['/v1/auth/two-factor/enable', { password: PASSWORD }],
        ['/v1/auth/organization/set-active', { organizationId: t.org.id }],
        ['/v1/auth/update-user', { name: 'Renamed' }],
      ] as const) {
        const refused = await client.post(path, body);
        expect(refused.statusCode, path).toBe(403);
        expect(refused.json()).toMatchObject({ code: 'PIN_SESSION_FORBIDDEN' });
      }
      const listSessions = await client.get('/v1/auth/list-sessions');
      expect(listSessions.statusCode).toBe(403);

      // Device-bound: the session cookie alone, in another browser, is not enough.
      const thief = browser();
      thief.jar.set(sessionCookie, client.jar.get(sessionCookie) ?? '');
      expect((await thief.get('/v1/me')).statusCode).toBe(401);
      expect((await thief.get('/v1/auth/get-session')).body).toBe('null');
      // ...and does not end the tablet's session either.
      expect((await client.get('/v1/me')).statusCode).toBe(200);

      expect((await client.post('/v1/auth/sign-out')).statusCode).toBe(200);
      expect(await query('select 1 from session where id = $1', [pinSession.id])).toEqual([]);
    });

    it('refuses every failure with the same answer', async () => {
      const t = await team('refuse');
      const other = await team('refuse-other');
      await setPin(t, t.members.staff, '2580');
      await setPin(other, other.members.staff, '2580');
      const { client, deviceId } = await tablet(t);
      const { deviceId: otherDevice } = await tablet(other);
      const noCookie = browser();

      const attempts = [
        await switchTo(client, deviceId, t.members.staff, '9753'),
        await switchTo(client, deviceId, uuidv7(), '2580'),
        await switchTo(client, deviceId, t.members.manager, '2580'),
        await switchTo(client, deviceId, t.ownerMemberId, '2580'),
        await switchTo(client, deviceId, t.members.kitchen, '2580'),
        await switchTo(client, deviceId, other.members.staff, '2580'),
        await switchTo(client, otherDevice, other.members.staff, '2580'),
        await switchTo(noCookie, deviceId, t.members.staff, '2580'),
      ];
      const shapes = attempts.map((res) => {
        const { requestId: _requestId, ...rest } = res.json<Record<string, unknown>>();
        return { status: res.statusCode, ...rest };
      });
      for (const shape of shapes) expect(shape).toEqual(shapes[0]);
      expect(shapes[0]).toMatchObject({ status: 403, code: 'FORBIDDEN' });
      // Nothing was opened, and the manager is still signed in on the tablet.
      expect((await client.get('/v1/me')).json()).toMatchObject({
        user: { id: t.manager.userId },
      });
    });

    it('locks the PIN after 5 failures until the lock ends', async () => {
      const t = await team('lock');
      await setPin(t, t.members.staff, '2580');
      const { client, deviceId } = await tablet(t);

      // A success ends the run of failures.
      for (let i = 0; i < 4; i += 1) {
        expect((await switchTo(client, deviceId, t.members.staff, '9753')).statusCode).toBe(403);
      }
      expect((await switchTo(client, deviceId, t.members.staff, '2580')).statusCode).toBe(200);
      for (let i = 0; i < 5; i += 1) {
        expect((await switchTo(client, deviceId, t.members.staff, '9753')).statusCode).toBe(403);
      }
      // Locked: even the right PIN is refused, with the time to wait.
      const locked = await switchTo(client, deviceId, t.members.staff, '2580');
      expect(locked.statusCode).toBe(429);
      expect(locked.json()).toMatchObject({ code: 'PIN_LOCKED', pinDisabled: false });
      expect(Number(locked.headers['retry-after'])).toBeGreaterThanOrEqual(1);

      await sleep(LOCK_MS + 100);
      expect((await switchTo(client, deviceId, t.members.staff, '2580')).statusCode).toBe(200);
    });

    it('disables the PIN after 15 failures in a day until a manager sets a new one', async () => {
      const t = await team('disable');
      await setPin(t, t.members.staff, '2580');
      const { client, deviceId } = await tablet(t);

      for (let round = 0; round < 3; round += 1) {
        for (let i = 0; i < 5; i += 1) {
          expect((await switchTo(client, deviceId, t.members.staff, '9753')).statusCode).toBe(403);
        }
        await sleep(LOCK_MS + 100);
      }
      const [row] = await query<{ pin_disabled_at: Date | null }>(
        'select pin_disabled_at from member where id = $1',
        [t.members.staff],
      );
      expect(row?.pin_disabled_at).not.toBeNull();
      const disabled = await switchTo(client, deviceId, t.members.staff, '2580');
      expect(disabled.statusCode).toBe(429);
      expect(disabled.json()).toMatchObject({ code: 'PIN_LOCKED', pinDisabled: true });

      // A new PIN from a manager lifts it.
      await setPin(t, t.members.staff, '3691');
      expect((await switchTo(client, deviceId, t.members.staff, '3691')).statusCode).toBe(200);
    });

    it('fails closed when Valkey cannot count attempts', async () => {
      const t = await team('closed');
      await setPin(t, t.members.staff, '2580');
      const { client, deviceId } = await tablet(t);
      const lockout = app.get(PinLockout, { strict: false });
      const verify = vi.spyOn(app.get(PinHasher, { strict: false }), 'verify');
      vi.spyOn(lockout, 'begin').mockRejectedValue(
        new PinLockoutUnavailableError(new Error('connection refused')),
      );

      const res = await switchTo(client, deviceId, t.members.staff, '2580');
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(res.headers['retry-after']).toBe('30');
      // No PIN was checked at all.
      expect(verify).not.toHaveBeenCalled();

      // The store itself reports an unreachable Valkey as unavailable, never as "proceed".
      const down = new Redis('redis://127.0.0.1:1', {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      try {
        await expect(
          new PinLockout(down, DEFAULT_PIN_LOCKOUT).begin(
            { deviceId, memberId: t.members.staff, generation: 'x' },
            true,
          ),
        ).rejects.toBeInstanceOf(PinLockoutUnavailableError);
      } finally {
        down.disconnect();
      }
    });
  });

  describe('PIN session lifetime', () => {
    it('ends at 12 hours, however often it is refreshed', async () => {
      const t = await team('ttl');
      await setPin(t, t.members.kitchen, '147036');
      const { client, deviceId } = await tablet(t);
      expect((await switchTo(client, deviceId, t.members.kitchen, '147036')).statusCode).toBe(200);
      const opened = await sessionRow(client.jar.get(sessionCookie));
      if (!opened) throw new Error('no PIN session');

      // Nearly 12 hours old and long past Better Auth's refresh age: nothing may extend it.
      await query(
        `update session set created_at = now() - interval '11 hours 58 minutes',
                            updated_at = now() - interval '2 days',
                            expires_at = now() + interval '2 minutes'
          where id = $1`,
        [opened.id],
      );
      for (let i = 0; i < 3; i += 1) {
        expect((await client.get('/v1/auth/get-session')).statusCode).toBe(200);
        expect((await client.get('/v1/me')).statusCode).toBe(200);
      }
      const refreshed = await sessionRow(client.jar.get(sessionCookie));
      if (!refreshed) throw new Error('session ended early');
      expect(refreshed.expires_at.getTime() - refreshed.created_at.getTime()).toBeLessThanOrEqual(
        TWELVE_HOURS_MS,
      );

      await query(
        `update session set created_at = now() - interval '12 hours 1 minute' where id = $1`,
        [opened.id],
      );
      expect((await client.get('/v1/me')).statusCode).toBe(401);
      expect(await query('select 1 from session where id = $1', [opened.id])).toEqual([]);
    });

    it('refuses and ends a PIN session that is bound to no device', async () => {
      const t = await team('forged');
      const row = await sessionRow(t.staff.client.jar.get(sessionCookie));
      if (!row) throw new Error('no session');
      await query('update session set pin_session = true where id = $1', [row.id]);
      expect((await t.staff.client.get('/v1/me')).statusCode).toBe(401);
      expect(await query('select 1 from session where id = $1', [row.id])).toEqual([]);
    });
  });

  describe('device revocation', () => {
    it('ends the sessions opened on the device and refuses its switches', async () => {
      const t = await team('revoke');
      await setPin(t, t.members.staff, '2580');
      const { client, deviceId } = await tablet(t);
      expect((await switchTo(client, deviceId, t.members.staff, '2580')).statusCode).toBe(200);
      const pinSession = await sessionRow(client.jar.get(sessionCookie));

      const revoked = await t.owner.client.delete(`/v1/staff-devices/${deviceId}`, key());
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json<{ revokedAt: string | null }>().revokedAt).not.toBeNull();
      expect(await query('select 1 from session where id = $1', [pinSession?.id])).toEqual([]);
      expect((await client.get('/v1/me')).statusCode).toBe(401);

      const again = await switchTo(client, deviceId, t.members.staff, '2580');
      expect(again.statusCode).toBe(403);
      expect(again.json()).toMatchObject({ code: 'DEVICE_REVOKED' });

      // Another organisation's device is not found, not revoked.
      const other = await team('revoke-other');
      const { deviceId: theirs } = await tablet(other);
      expect((await t.owner.client.delete(`/v1/staff-devices/${theirs}`, key())).statusCode).toBe(
        404,
      );
      const [still] = await query<{ revoked_at: Date | null }>(
        'select revoked_at from staff_devices where id = $1',
        [theirs],
      );
      expect(still?.revoked_at).toBeNull();
    });
  });
});
