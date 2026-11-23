import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  detectIntegrationRuntime,
  startPostgres,
  startValkey,
  type StartedService,
} from '@radd/config/testing';
import { createDb, type DbHandle } from '@radd/db';
import { createTestDatabase, type TestDatabase } from '@radd/db/testing';
import { MemoryMailer } from '@radd/mail';
import { uuidv7 } from '@radd/shared';

import { createApp } from '../src/app.factory';
import { latestCode, randomIp, TestBrowser, totp, uniqueEmail } from './support/auth-client';
import { testEnv } from './support/env';

const runtime = await detectIntegrationRuntime(['postgres', 'valkey']);

const CONSOLE = 'http://localhost:3001';
const PASSWORD = 'correct horse battery';
const API_ORIGIN = new URL(testEnv().BETTER_AUTH_URL).origin;
const SESSION_COOKIE = 'radd-test.session_token';
/** Allowlisted for this run only (SUPER_ADMIN_EMAILS). */
const ADMIN_EMAIL = uniqueEmail('admin');
const LISTED_NO_2FA_EMAIL = uniqueEmail('listed');

interface Account {
  email: string;
  userId: string;
  client: TestBrowser;
}

describe.skipIf(!runtime.ready)('super admin (ADR-027)', () => {
  let postgres: StartedService;
  let valkey: StartedService;
  let database: TestDatabase;
  let sql: DbHandle;
  let app: NestFastifyApplication;
  const mailer = new MemoryMailer();
  let admin: Account & { secret: string };

  const query = async <T>(text: string, values: unknown[] = []): Promise<T[]> =>
    (await sql.pool.query(text, values)).rows as T[];
  const key = () => ({ 'idempotency-key': uuidv7() });
  const browser = () => new TestBrowser(app, { origin: CONSOLE, ip: randomIp() });

  async function signUp(label: string, email = uniqueEmail(label)): Promise<Account> {
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

  /** Turns two-factor on; confirming it is a TOTP check, which stamps this session. */
  async function enableTwoFactor(account: Account): Promise<string> {
    const enable = await account.client.post('/v1/auth/two-factor/enable', { password: PASSWORD });
    expect(enable.statusCode).toBe(200);
    const secret =
      new URL(enable.json<{ totpURI: string }>().totpURI).searchParams.get('secret') ?? '';
    const confirm = await account.client.post('/v1/auth/two-factor/verify-totp', {
      code: totp(secret),
    });
    expect(confirm.statusCode).toBe(200);
    return secret;
  }

  const sessionId = async (client: TestBrowser) => {
    const token = (client.jar.get(SESSION_COOKIE) ?? '').split('.')[0];
    const [row] = await query<{ id: string }>('select id from session where token = $1', [token]);
    if (!row) throw new Error('no session');
    return row.id;
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
        SUPER_ADMIN_EMAILS: `${ADMIN_EMAIL},${LISTED_NO_2FA_EMAIL}`,
      }),
      { mailer, auth: { rateLimit: false, codeRequestLimit: false } },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const account = await signUp('admin', ADMIN_EMAIL);
    admin = { ...account, secret: await enableTwoFactor(account) };
  });

  afterAll(async () => {
    await app.close();
    await sql.close();
    await database.drop();
    await Promise.all([postgres.stop(), valkey.stop()]);
  });

  describe('the admin guard', () => {
    it('refuses everyone but an allowlisted, two-factor admin with a recent TOTP check', async () => {
      const anonymous = await browser().get('/v1/admin/orgs');
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json()).toMatchObject({ code: 'UNAUTHENTICATED' });

      const ordinary = await signUp('ordinary');
      await enableTwoFactor(ordinary);
      const listedNoTwoFactor = await signUp('listed', LISTED_NO_2FA_EMAIL);
      for (const account of [ordinary, listedNoTwoFactor]) {
        const res = await account.client.get('/v1/admin/orgs');
        expect(res.statusCode).toBe(403);
        // Nothing says an admin area exists.
        expect(res.json()).toMatchObject({ code: 'FORBIDDEN' });
        expect((await account.client.get('/v1/me')).json()).toMatchObject({ isSuperAdmin: false });
      }

      expect((await admin.client.get('/v1/admin/orgs')).statusCode).toBe(200);
      expect((await admin.client.get('/v1/me')).json()).toMatchObject({ isSuperAdmin: true });
    });

    it('asks for a fresh TOTP check when the session has none from the last 12 hours', async () => {
      const id = await sessionId(admin.client);
      const stamps = [null, new Date(Date.now() - 12 * 60 * 60 * 1000 - 60_000)];
      for (const stamp of stamps) {
        await query('update session set two_factor_verified_at = $2 where id = $1', [id, stamp]);
        const res = await admin.client.get('/v1/admin/orgs');
        expect(res.statusCode).toBe(403);
        expect(res.json()).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' });
        expect((await admin.client.get('/v1/me')).json()).toMatchObject({ isSuperAdmin: false });
      }

      // A password sign-in answered with a TOTP code gives a session that passes.
      const fresh = browser();
      const signIn = await fresh.post('/v1/auth/sign-in/email', {
        email: ADMIN_EMAIL,
        password: PASSWORD,
      });
      expect(signIn.json()).toMatchObject({ twoFactorRedirect: true });
      expect((await fresh.get('/v1/admin/orgs')).statusCode).toBe(401);
      const verify = await fresh.post('/v1/auth/two-factor/verify-totp', {
        code: totp(admin.secret),
        trustDevice: true,
      });
      expect(verify.statusCode).toBe(200);
      expect((await fresh.get('/v1/admin/orgs')).statusCode).toBe(200);

      // "Remember this device" skips the check next time, so that session does not count.
      expect((await fresh.post('/v1/auth/sign-out')).statusCode).toBe(200);
      const trusted = await fresh.post('/v1/auth/sign-in/email', {
        email: ADMIN_EMAIL,
        password: PASSWORD,
      });
      expect(trusted.statusCode).toBe(200);
      expect(trusted.json()).not.toMatchObject({ twoFactorRedirect: true });
      const skipped = await fresh.get('/v1/admin/orgs');
      expect(skipped.statusCode).toBe(403);
      expect(skipped.json()).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' });

      // Back to a passing session for the other tests.
      await query('update session set two_factor_verified_at = now() where id = $1', [id]);
    });
  });

  describe('/v1/admin/orgs', () => {
    it('lists, reads and changes organisations through the admin pool', async () => {
      const owner = await signUp('tenant-owner');
      const name = `Admin Target ${String(Date.now())}`;
      const created = await owner.client.post('/v1/organizations', { name }, key());
      expect(created.statusCode).toBe(201);
      const org = created.json<{ id: string; slug: string }>();

      const list = await admin.client.get(`/v1/admin/orgs?search=${encodeURIComponent(name)}`);
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({
        items: [{ id: org.id, name, plan: 'free', status: 'active', memberCount: 1 }],
        nextCursor: null,
      });
      // `%` and `_` match themselves, not everything.
      expect((await admin.client.get('/v1/admin/orgs?search=%25')).json()).toMatchObject({
        items: [],
      });
      const page = (await admin.client.get('/v1/admin/orgs?limit=1')).json<{
        items: unknown[];
        nextCursor: string | null;
      }>();
      expect(page.items).toHaveLength(1);

      expect((await admin.client.get(`/v1/admin/orgs/${org.id}`)).json()).toMatchObject({
        id: org.id,
        slug: org.slug,
      });
      expect((await admin.client.get(`/v1/admin/orgs/${uuidv7()}`)).statusCode).toBe(404);

      const suspended = await admin.client.patch(`/v1/admin/orgs/${org.id}`, {
        status: 'suspended',
      });
      expect(suspended.statusCode).toBe(200);
      expect(suspended.json()).toMatchObject({ status: 'suspended', plan: 'free' });
      const write = await owner.client.post(
        '/v1/restaurants',
        { name: { en: 'Closed' }, slug: `closed-${String(Date.now())}` },
        key(),
      );
      expect(write.json()).toMatchObject({ code: 'ORG_SUSPENDED' });

      const upgraded = await admin.client.patch(`/v1/admin/orgs/${org.id}`, {
        status: 'active',
        plan: 'pro',
      });
      expect(upgraded.json()).toMatchObject({ status: 'active', plan: 'pro' });
      const [row] = await query<{ status: string; plan: string }>(
        'select status, plan from organization where id = $1',
        [org.id],
      );
      expect(row).toEqual({ status: 'active', plan: 'pro' });

      for (const body of [{}, { plan: 'gold' }, { status: 'deleted' }, { name: 'x' }]) {
        expect((await admin.client.patch(`/v1/admin/orgs/${org.id}`, body)).statusCode).toBe(400);
      }
      expect(
        (await admin.client.patch(`/v1/admin/orgs/${uuidv7()}`, { plan: 'pro' })).statusCode,
      ).toBe(404);
      // An owner cannot reach it.
      expect(
        (await owner.client.patch(`/v1/admin/orgs/${org.id}`, { plan: 'bundle' })).statusCode,
      ).toBe(403);

      // The calls went through the admin role's own pool, nothing else.
      const connections = await query<{ usename: string }>(
        `select distinct usename::text from pg_stat_activity where application_name = 'radd-api-admin'`,
      );
      expect(connections).toEqual([{ usename: 'app_admin' }]);
    });
  });

  describe('Bull Board', () => {
    it('opens for a super admin only', async () => {
      expect((await browser().get('/v1/admin/queues')).statusCode).toBe(401);
      const ordinary = await signUp('queues');
      const refused = await ordinary.client.get('/v1/admin/queues');
      expect(refused.statusCode).toBe(403);
      expect(refused.headers['content-type']).toContain('application/problem+json');
      expect((await ordinary.client.get('/v1/admin/queues/api/queues')).statusCode).toBe(403);

      const page = await admin.client.get('/v1/admin/queues');
      expect(page.statusCode).toBe(200);
      expect(page.headers['content-type']).toContain('text/html');
      const queues = await admin.client.get('/v1/admin/queues/api/queues');
      expect(queues.statusCode).toBe(200);
      expect(queues.body).toContain('notify.email');
    });

    it('accepts changes from its own page only', async () => {
      const crossSite = await admin.client.put('/v1/admin/queues/api/queues/noop/pause', {});
      expect(crossSite.statusCode).toBe(403);
      const ownPage = await admin.client.put(
        '/v1/admin/queues/api/queues/noop/pause',
        {},
        { origin: API_ORIGIN },
      );
      expect(ownPage.statusCode).toBeLessThan(300);
      expect(
        (
          await admin.client.put(
            '/v1/admin/queues/api/queues/noop/resume',
            {},
            { origin: API_ORIGIN },
          )
        ).statusCode,
      ).toBeLessThan(300);
    });
  });
});
