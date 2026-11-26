import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { type Redis } from 'ioredis';
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
import { isUuidV7, uuidv7 } from '@radd/shared';

import { createApp } from '../src/app.factory';
import { type AppModuleOptions } from '../src/app.module';
import {
  hashedOtp,
  latestCode,
  randomIp,
  setCookies,
  TestBrowser,
  totp,
  uniqueEmail,
} from './support/auth-client';
import { testEnv } from './support/env';
import { VALKEY } from '../src/valkey/valkey.module';

const runtime = await detectIntegrationRuntime(['postgres', 'valkey']);

const CONSOLE = 'http://localhost:3001';
const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'another long passphrase';
const SESSION_COOKIE = 'radd-test.session_token';

interface Services {
  postgres: StartedService;
  valkey: StartedService;
  database: TestDatabase;
  /** Superuser connection for assertions on what Better Auth wrote. */
  sql: DbHandle;
}

async function boot(
  services: Services,
  mailer: MemoryMailer,
  options: AppModuleOptions = {},
  overrides: Record<string, string> = {},
): Promise<NestFastifyApplication> {
  const app = await createApp(
    testEnv({
      DATABASE_URL: services.database.urls.runtime,
      DATABASE_URL_ADMIN: services.database.urls.admin,
      REDIS_URL: services.valkey.url,
      ...overrides,
    }),
    { mailer, auth: { rateLimit: false, codeRequestLimit: false }, ...options },
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe.skipIf(!runtime.ready)('auth (Better Auth at /v1/auth)', () => {
  const services = {} as Services;
  const mailer = new MemoryMailer();
  let app: NestFastifyApplication;

  const browser = (locale?: string) =>
    new TestBrowser(app, { origin: CONSOLE, ip: randomIp(), ...(locale ? { locale } : {}) });

  const query = async <T>(text: string, values: unknown[] = []): Promise<T[]> =>
    (await services.sql.pool.query(text, values)).rows as T[];

  /** Signs up and verifies with the emailed code; returns the signed-in browser. */
  async function verifiedUser(label: string): Promise<{ email: string; client: TestBrowser }> {
    const email = uniqueEmail(label);
    const client = browser();
    const signUp = await client.post('/v1/auth/sign-up/email', {
      name: label,
      email,
      password: PASSWORD,
    });
    expect(signUp.statusCode).toBe(200);
    const otp = await latestCode(app, mailer, email);
    const verify = await client.post('/v1/auth/email-otp/verify-email', { email, otp });
    expect(verify.statusCode).toBe(200);
    return { email, client };
  }

  async function createOrganization(name: string): Promise<string> {
    const id = uuidv7();
    await query('insert into organization (id, name, slug) values ($1, $2, $3)', [
      id,
      name,
      `${name.toLowerCase().replace(/\W+/g, '-')}-${id.slice(-6)}`,
    ]);
    return id;
  }

  async function userId(email: string): Promise<string> {
    const [row] = await query<{ id: string }>('select id from "user" where email = $1', [email]);
    if (!row) throw new Error(`no user ${email}`);
    return row.id;
  }

  beforeAll(async () => {
    [services.postgres, services.valkey] = await Promise.all([startPostgres(), startValkey()]);
    services.database = await createTestDatabase(services.postgres.url);
    services.sql = createDb({ url: services.database.urls.superuser, max: 2 });
    app = await boot(services, mailer);
  });

  afterAll(async () => {
    await app.close();
    await services.sql.close();
    await services.database.drop();
    await Promise.all([services.postgres.stop(), services.valkey.stop()]);
  });

  describe('sign-up, verification, sign-out and sign-in', () => {
    it('runs the whole flow', async () => {
      const email = uniqueEmail('rana');
      const client = browser();

      const signUp = await client.post('/v1/auth/sign-up/email', {
        name: 'Rana',
        email,
        password: PASSWORD,
      });
      expect(signUp.statusCode).toBe(200);
      expect(signUp.json()).toMatchObject({ token: null, user: { email, emailVerified: false } });
      // No session until the address is confirmed.
      expect(client.jar.size).toBe(0);
      expect((await client.get('/v1/me')).statusCode).toBe(401);

      const otp = await latestCode(app, mailer, email);
      expect(otp).toMatch(/^\d{6}$/);
      const message = mailer.latestTo(email);
      expect(message?.subject).toMatch(/^Confirm your email for Radd Menu/);
      expect(message?.html).toContain('dir="ltr"');

      const early = await client.post('/v1/auth/sign-in/email', { email, password: PASSWORD });
      expect(early.statusCode).toBe(403);
      expect(early.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

      const verify = await client.post('/v1/auth/email-otp/verify-email', { email, otp });
      expect(verify.statusCode).toBe(200);
      expect(client.jar.has(SESSION_COOKIE)).toBe(true);

      const me = await client.get('/v1/me');
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({
        user: { email, name: 'Rana', emailVerified: true, twoFactorEnabled: false },
        session: { activeOrganizationId: null, pinSession: false, twoFactorVerifiedAt: null },
        memberships: [],
      });

      const staleCookie = client.jar.get(SESSION_COOKIE);
      const signOut = await client.post('/v1/auth/sign-out');
      expect(signOut.statusCode).toBe(200);
      expect((await client.get('/v1/me')).statusCode).toBe(401);
      // The old cookie is dead on the server too, not only cleared in the browser.
      const replay = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { cookie: `${SESSION_COOKIE}=${staleCookie ?? ''}` },
      });
      expect(replay.statusCode).toBe(401);
      expect(replay.headers['content-type']).toContain('application/problem+json');
      expect(replay.json()).toMatchObject({ code: 'UNAUTHENTICATED' });

      const signIn = await client.post('/v1/auth/sign-in/email', { email, password: PASSWORD });
      expect(signIn.statusCode).toBe(200);
      expect((await client.get('/v1/me')).json()).toMatchObject({ user: { email } });
    });

    it('sends the verification code in Arabic when the console asks for it', async () => {
      const email = uniqueEmail('samir');
      const res = await browser('ar').post('/v1/auth/sign-up/email', {
        name: 'Samir',
        email,
        password: PASSWORD,
      });
      expect(res.statusCode).toBe(200);
      await latestCode(app, mailer, email);
      const message = mailer.latestTo(email);
      expect(message?.html).toContain('dir="rtl"');
      expect(message?.subject).toContain('أكّد بريدك الإلكتروني');
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const { email } = await verifiedUser('wrongpass');
      const client = browser();
      const wrong = await client.post('/v1/auth/sign-in/email', {
        email,
        password: 'not the password',
      });
      const unknown = await client.post('/v1/auth/sign-in/email', {
        email: uniqueEmail('nobody'),
        password: 'not the password',
      });
      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(wrong.statusCode);
      expect(unknown.json()).toEqual(wrong.json());
    });

    it('refuses passwords shorter than 12 characters', async () => {
      const email = uniqueEmail('short');
      const res = await browser().post('/v1/auth/sign-up/email', {
        name: 'Short',
        email,
        password: 'elevenchars',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
      expect(await query('select 1 from "user" where email = $1', [email])).toHaveLength(0);
    });

    it('stores passwords as argon2id and writes UUIDv7 IDs', async () => {
      const { email } = await verifiedUser('argon');
      const id = await userId(email);
      expect(isUuidV7(id)).toBe(true);
      const accounts = await query<{ id: string; password: string }>(
        'select id, password from account where user_id = $1',
        [id],
      );
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(isUuidV7(accounts[0]?.id)).toBe(true);
      const sessions = await query<{ id: string }>('select id from session where user_id = $1', [
        id,
      ]);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((row) => isUuidV7(row.id))).toBe(true);

      await browser().post('/v1/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
      const verifications = await query<{ id: string }>(
        'select id from verification where identifier = $1',
        [`sign-in-otp-${email}`],
      );
      expect(verifications).toHaveLength(1);
      expect(isUuidV7(verifications[0]?.id)).toBe(true);
    });
  });

  describe('sign-in with an email code', () => {
    it('signs in with the emailed code, which is stored hashed', async () => {
      const { email } = await verifiedUser('codein');
      const client = browser();
      const send = await client.post('/v1/auth/email-otp/send-verification-otp', {
        email,
        type: 'sign-in',
      });
      expect(send.statusCode).toBe(200);
      const otp = await latestCode(app, mailer, email);
      expect(mailer.latestTo(email)?.subject).toMatch(/sign-in code/);

      const [stored] = await query<{ value: string }>(
        'select value from verification where identifier = $1',
        [`sign-in-otp-${email}`],
      );
      expect(stored?.value).toBeDefined();
      expect(stored?.value).not.toContain(otp ?? 'missing');
      expect(stored?.value).toBe(`${hashedOtp(otp ?? '')}:0`);

      const signIn = await client.post('/v1/auth/sign-in/email-otp', { email, otp });
      expect(signIn.statusCode).toBe(200);
      expect((await client.get('/v1/me')).json()).toMatchObject({ user: { email } });
    });

    it('invalidates the code after three wrong attempts', async () => {
      const { email } = await verifiedUser('threewrong');
      const client = browser();
      await client.post('/v1/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
      const otp = await latestCode(app, mailer, email);
      const wrong = otp === '000000' ? '111111' : '000000';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await client.post('/v1/auth/sign-in/email-otp', { email, otp: wrong });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ code: 'INVALID_OTP' });
      }
      const late = await client.post('/v1/auth/sign-in/email-otp', { email, otp });
      expect(late.statusCode).toBe(403);
      expect(late.json()).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
      expect(client.jar.has(SESSION_COOKIE)).toBe(false);
    });

    it('sends no code to an unknown address and creates no account', async () => {
      const email = uniqueEmail('ghost');
      const res = await browser().post('/v1/auth/email-otp/send-verification-otp', {
        email,
        type: 'sign-in',
      });
      expect(res.statusCode).toBe(200);
      expect(await latestCode(app, mailer, email)).toBeUndefined();
      expect(await query('select 1 from "user" where email = $1', [email])).toHaveLength(0);
    });
  });

  describe('password reset with a code', () => {
    it('resets the password and ends every existing session', async () => {
      const { email, client: oldDevice } = await verifiedUser('reset');
      expect((await oldDevice.get('/v1/me')).statusCode).toBe(200);

      const client = browser();
      const request = await client.post('/v1/auth/email-otp/request-password-reset', { email });
      expect(request.statusCode).toBe(200);
      const otp = await latestCode(app, mailer, email);
      expect(mailer.latestTo(email)?.subject).toMatch(/password reset code/);

      const reset = await client.post('/v1/auth/email-otp/reset-password', {
        email,
        otp,
        password: NEW_PASSWORD,
      });
      expect(reset.statusCode).toBe(200);

      expect((await oldDevice.get('/v1/me')).statusCode).toBe(401);
      const old = await client.post('/v1/auth/sign-in/email', { email, password: PASSWORD });
      expect(old.statusCode).toBe(401);
      const fresh = await client.post('/v1/auth/sign-in/email', { email, password: NEW_PASSWORD });
      expect(fresh.statusCode).toBe(200);
    });

    it('leaves the link-based reset disabled', async () => {
      const res = await browser().post('/v1/auth/request-password-reset', {
        email: uniqueEmail('link'),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('two-factor accounts', () => {
    it('get no sign-in code and cannot sign in with one', async () => {
      const { email, client } = await verifiedUser('totp');

      const enable = await client.post('/v1/auth/two-factor/enable', { password: PASSWORD });
      expect(enable.statusCode).toBe(200);
      const { totpURI } = enable.json<{ totpURI: string }>();
      const uri = new URL(totpURI);
      expect(uri.searchParams.get('issuer')).toBe('Radd Menu');
      const secret = uri.searchParams.get('secret') ?? '';
      const confirm = await client.post('/v1/auth/two-factor/verify-totp', { code: totp(secret) });
      expect(confirm.statusCode).toBe(200);
      const [flags] = await query<{ two_factor_enabled: boolean }>(
        'select two_factor_enabled from "user" where email = $1',
        [email],
      );
      expect(flags?.two_factor_enabled).toBe(true);

      // Password sign-in is challenged by Better Auth itself.
      const password = await browser().post('/v1/auth/sign-in/email', {
        email,
        password: PASSWORD,
      });
      expect(password.statusCode).toBe(200);
      expect(password.json()).toMatchObject({ twoFactorRedirect: true });

      // No sign-in code is emailed, though the answer is the same as for anyone else.
      const before = mailer.sent.length;
      const send = await browser().post('/v1/auth/email-otp/send-verification-otp', {
        email,
        type: 'sign-in',
      });
      expect(send.statusCode).toBe(200);
      expect(send.json()).toEqual({ success: true });
      await latestCode(app, mailer, email);
      expect(mailer.sent.slice(before).filter((m) => m.to === email)).toHaveLength(0);

      // Even a valid code (planted, since none was sent) is refused like a wrong one.
      const planted = '424242';
      await query('delete from verification where identifier = $1', [`sign-in-otp-${email}`]);
      await query(
        `insert into verification (id, identifier, value, expires_at)
         values ($1, $2, $3, now() + interval '5 minutes')`,
        [uuidv7(), `sign-in-otp-${email}`, `${hashedOtp(planted)}:0`],
      );
      const attacker = browser();
      const blocked = await attacker.post('/v1/auth/sign-in/email-otp', { email, otp: planted });
      const { email: other } = await verifiedUser('plain');
      const wrong = await browser().post('/v1/auth/sign-in/email-otp', {
        email: other,
        otp: planted,
      });
      expect(blocked.statusCode).toBe(wrong.statusCode);
      expect(blocked.json()).toEqual(wrong.json());
      expect(attacker.jar.has(SESSION_COOKIE)).toBe(false);

      // Nor can an email-verification code sign a verified account in.
      const verify = await attacker.post('/v1/auth/email-otp/verify-email', {
        email,
        otp: planted,
      });
      expect(verify.statusCode).toBe(400);
      expect(attacker.jar.has(SESSION_COOKIE)).toBe(false);
    });
  });

  describe('server-only fields', () => {
    it('cannot be set through sign-up', async () => {
      const email = uniqueEmail('sneaky');
      const res = await browser().post('/v1/auth/sign-up/email', {
        name: 'Sneaky',
        email,
        password: PASSWORD,
        emailVerified: true,
        plan: 'pro',
        status: 'suspended',
        pinSession: true,
        twoFactorVerifiedAt: new Date().toISOString(),
        activeOrganizationId: uuidv7(),
      });
      expect(res.statusCode).toBe(200);
      const [row] = await query<{ email_verified: boolean; two_factor_enabled: boolean }>(
        'select email_verified, two_factor_enabled from "user" where email = $1',
        [email],
      );
      expect(row).toEqual({ email_verified: false, two_factor_enabled: false });

      // A server-only field with a default is replaced by the default on create.
      const twoFactorEmail = uniqueEmail('sneaky2fa');
      const twoFactor = await browser().post('/v1/auth/sign-up/email', {
        name: 'Sneaky',
        email: twoFactorEmail,
        password: PASSWORD,
        twoFactorEnabled: true,
      });
      expect(twoFactor.statusCode).toBeLessThan(500);
      expect(
        await query('select 1 from "user" where email = $1 and two_factor_enabled', [
          twoFactorEmail,
        ]),
      ).toHaveLength(0);
    });

    it('cannot be changed on the session, the user or the active organisation', async () => {
      const { email, client } = await verifiedUser('session');
      const otherOrg = await createOrganization('Other Org');
      const id = await userId(email);
      const snapshot = () =>
        query(
          `select active_organization_id, pin_session, two_factor_verified_at, staff_device_id
           from session where user_id = $1 order by id`,
          [id],
        );
      const before = await snapshot();

      for (const body of [
        { pinSession: true },
        { twoFactorVerifiedAt: new Date().toISOString() },
        { activeOrganizationId: otherOrg },
        { staffDeviceId: uuidv7() },
      ]) {
        const res = await client.post('/v1/auth/update-session', body);
        expect(res.statusCode, JSON.stringify(body)).toBe(400);
      }
      const setActive = await client.post('/v1/auth/organization/set-active', {
        organizationId: otherOrg,
      });
      expect(setActive.statusCode).toBeGreaterThanOrEqual(400);
      expect(setActive.statusCode).toBeLessThan(500);

      const updateUser = await client.post('/v1/auth/update-user', { twoFactorEnabled: true });
      expect(updateUser.statusCode).toBe(400);

      expect(await snapshot()).toEqual(before);
      const [flags] = await query<{ two_factor_enabled: boolean }>(
        'select two_factor_enabled from "user" where id = $1',
        [id],
      );
      expect(flags?.two_factor_enabled).toBe(false);
      const [org] = await query<{ plan: string; status: string }>(
        'select plan, status from organization where id = $1',
        [otherOrg],
      );
      expect(org).toEqual({ plan: 'free', status: 'active' });
    });
  });

  describe('organisations', () => {
    it('starts a member of exactly one organisation in it and lists memberships', async () => {
      const { email } = await verifiedUser('member');
      const orgId = await createOrganization('Beit Tayta');
      await query(
        'insert into member (id, user_id, organization_id, role) values ($1, $2, $3, $4)',
        [uuidv7(), await userId(email), orgId, 'manager'],
      );

      const client = browser();
      expect(
        (await client.post('/v1/auth/sign-in/email', { email, password: PASSWORD })).statusCode,
      ).toBe(200);
      const me = await client.get('/v1/me');
      expect(me.json()).toMatchObject({
        session: { activeOrganizationId: orgId },
        memberships: [{ organizationId: orgId, name: 'Beit Tayta', role: 'manager' }],
      });

      const full = await client.get('/v1/auth/organization/get-full-organization');
      expect(full.statusCode).toBe(200);
      expect(full.json()).toMatchObject({ id: orgId, plan: 'free', status: 'active' });
      expect(JSON.stringify(full.json())).not.toContain('pinHash');
    });

    it('answers 404 for organisation endpoints the API wraps itself', async () => {
      const { client } = await verifiedUser('creator');
      for (const path of [
        '/v1/auth/organization/create',
        '/v1/auth/organization/invite-member',
        '/v1/auth/organization/update-member-role',
      ]) {
        expect((await client.post(path, { name: 'X', slug: 'x' })).statusCode, path).toBe(404);
      }
    });

    it('answers 4xx, not 500, for a malformed ID', async () => {
      const { client } = await verifiedUser('badid');
      const body = await client.post('/v1/auth/organization/set-active', {
        organizationId: 'not-a-uuid',
      });
      expect(body.statusCode).toBe(400);
      expect(body.json()).toMatchObject({ code: 'INVALID_ID' });
      const queryString = await client.get(
        '/v1/auth/organization/get-full-organization?organizationId=1%27%20or%201%3D1',
      );
      expect(queryString.statusCode).toBe(400);
      const invitation = await client.get('/v1/auth/organization/get-invitation?id=nope');
      expect(invitation.statusCode).toBe(400);
    });
  });

  describe('cookies', () => {
    it('are prefixed per environment, HttpOnly and SameSite=Lax', async () => {
      const { email } = await verifiedUser('cookie');
      const res = await browser().post('/v1/auth/sign-in/email', { email, password: PASSWORD });
      const session = setCookies(res).find((cookie) => cookie.name === SESSION_COOKIE);
      expect(session).toBeDefined();
      const attributes = (session?.attributes ?? []).map((a) => a.toLowerCase());
      expect(attributes).toContain('httponly');
      expect(attributes).toContain('samesite=lax');
      expect(attributes).toContain('path=/');
      expect(attributes.some((a) => a.startsWith('domain='))).toBe(false);
    });

    it('rejects a state-changing request with cookies from an untrusted origin', async () => {
      const { client } = await verifiedUser('csrf');
      const res = await client.post('/v1/auth/sign-out', {}, { origin: 'https://evil.example' });
      expect(res.statusCode).toBe(403);
      expect((await client.get('/v1/me')).statusCode).toBe(200);
    });
  });

  describe('with staging-like settings (https, parent-domain cookies)', () => {
    let staging: NestFastifyApplication;
    const stagingMailer = new MemoryMailer();

    beforeAll(async () => {
      staging = await boot(
        services,
        stagingMailer,
        {},
        {
          BETTER_AUTH_URL: 'https://api.radd.test/v1/auth',
          AUTH_COOKIE_DOMAIN: 'radd.test',
          TRUSTED_ORIGINS: 'https://app.radd.test',
        },
      );
    });

    afterAll(async () => {
      await staging.close();
    });

    it('sets Secure parent-domain cookies and runs sign-up to sign-in', async () => {
      const email = uniqueEmail('staging');
      const client = new TestBrowser(staging, { origin: 'https://app.radd.test', ip: randomIp() });
      expect(
        (await client.post('/v1/auth/sign-up/email', { name: 'S', email, password: PASSWORD }))
          .statusCode,
      ).toBe(200);
      const otp = await latestCode(staging, stagingMailer, email);
      const verify = await client.post('/v1/auth/email-otp/verify-email', { email, otp });
      expect(verify.statusCode).toBe(200);

      const cookie = setCookies(verify).find((c) => c.name === '__Secure-radd-test.session_token');
      expect(cookie).toBeDefined();
      const attributes = (cookie?.attributes ?? []).map((a) => a.toLowerCase());
      expect(attributes).toContain('secure');
      expect(attributes).toContain('httponly');
      expect(attributes).toContain('domain=radd.test');

      expect((await client.get('/v1/me')).statusCode).toBe(200);
      expect((await client.post('/v1/auth/sign-out')).statusCode).toBe(200);
      expect((await client.get('/v1/me')).statusCode).toBe(401);
      const signIn = await client.post('/v1/auth/sign-in/email', { email, password: PASSWORD });
      expect(signIn.statusCode).toBe(200);
      expect((await client.get('/v1/me')).statusCode).toBe(200);
    });
  });

  describe('rate limits', () => {
    it('refuses the fourth password sign-in within 10 seconds', async () => {
      const limited = await boot(services, mailer, {
        auth: { rateLimit: true, codeRequestLimit: false },
      });
      try {
        const client = new TestBrowser(limited, { origin: CONSOLE, ip: randomIp() });
        const attempt = () =>
          client.post('/v1/auth/sign-in/email', {
            email: uniqueEmail('limit'),
            password: 'wrong password!',
          });
        for (let i = 0; i < 3; i += 1) expect((await attempt()).statusCode).toBe(401);
        const fourth = await attempt();
        expect(fourth.statusCode).toBe(429);
        expect(Number(fourth.headers['retry-after'])).toBeGreaterThan(0);
        // Another client IP has its own bucket.
        const other = new TestBrowser(limited, { origin: CONSOLE, ip: randomIp() });
        expect(
          (
            await other.post('/v1/auth/sign-in/email', {
              email: uniqueEmail('limit'),
              password: 'wrong password!',
            })
          ).statusCode,
        ).toBe(401);
      } finally {
        await limited.close();
      }
    });

    it('refuses the eleventh code request from one IP within 15 minutes', async () => {
      const limited = await boot(services, mailer, {
        auth: { rateLimit: false, codeRequestLimit: true },
      });
      try {
        const client = new TestBrowser(limited, { origin: CONSOLE, ip: randomIp() });
        for (let i = 0; i < 10; i += 1) {
          const path =
            i % 2 === 0
              ? '/v1/auth/email-otp/send-verification-otp'
              : '/v1/auth/email-otp/request-password-reset';
          const res = await client.post(path, { email: uniqueEmail('codes'), type: 'sign-in' });
          expect(res.statusCode, `request ${String(i + 1)}`).toBe(200);
        }
        const eleventh = await client.post('/v1/auth/email-otp/send-verification-otp', {
          email: uniqueEmail('codes'),
          type: 'sign-in',
        });
        expect(eleventh.statusCode).toBe(429);
        expect(Number(eleventh.headers['retry-after'])).toBeGreaterThan(800);
        expect(eleventh.json()).toEqual({ message: 'Too many requests. Please try again later.' });
      } finally {
        await limited.close();
      }
    });

    // ADR-034 (security review of Phase 1, M1): from 12 IPs, 12 codes reached one inbox.
    it('sends one address at most 5 codes an hour, whatever the IP', async () => {
      const limited = await boot(services, mailer, {
        auth: { rateLimit: false, codeRequestLimit: true },
      });
      try {
        const { email } = await verifiedUser('address-codes');
        const delivered = async () => {
          await latestCode(limited, mailer, email);
          return mailer.sent.filter((mail) => mail.to === email).length;
        };
        const before = await delivered();
        const request = (address: string, i: number) =>
          new TestBrowser(limited, { origin: CONSOLE, ip: randomIp() }).post(
            i % 2 === 0
              ? '/v1/auth/email-otp/send-verification-otp'
              : '/v1/auth/email-otp/request-password-reset',
            { email: address, type: 'sign-in' },
          );
        // Case and spacing do not open a second bucket (the sixth is the spaced spelling).
        const spellings = [email, email.toUpperCase(), email, email, email];
        for (const [i, spelling] of spellings.entries()) {
          expect((await request(spelling, i)).statusCode, `code ${String(i + 1)}`).toBe(200);
        }
        const sixth = await request(` ${email.toUpperCase()} `, 5);
        expect(sixth.statusCode).toBe(429);
        expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(3000);
        expect(sixth.json()).toEqual({ message: 'Too many requests. Please try again later.' });
        expect((await delivered()) - before).toBe(5);

        // An address without an account is capped the same way, so the cap reveals nothing.
        const nobody = uniqueEmail('address-codes-nobody');
        for (let i = 0; i < 5; i += 1) expect((await request(nobody, i)).statusCode).toBe(200);
        const refused = await request(nobody, 5);
        expect(refused.statusCode).toBe(429);
        expect(refused.json()).toEqual(sixth.json());
        // Other addresses are untouched.
        expect((await request(uniqueEmail('address-codes-other'), 0)).statusCode).toBe(200);
      } finally {
        await limited.close();
      }
    });

    // ADR-034 (security review of Phase 1, M2): 15 wrong passwords from 15 IPs were never slowed.
    it('pauses password sign-in for an address after 10 wrong passwords, whatever the IP', async () => {
      const { email } = await verifiedUser('lockout');
      const signIn = (address: string, password: string) =>
        new TestBrowser(app, { origin: CONSOLE, ip: randomIp() }).post('/v1/auth/sign-in/email', {
          email: address,
          password,
        });

      // A correct password clears the count: 9 wrong, right, 9 wrong is never paused.
      for (let i = 0; i < 9; i += 1)
        expect((await signIn(email, `wrong ${String(i)}`)).statusCode).toBe(401);
      expect((await signIn(email, PASSWORD)).statusCode).toBe(200);
      for (let i = 0; i < 9; i += 1)
        expect((await signIn(email, `wrong ${String(i)}`)).statusCode).toBe(401);
      // The 10th failure in a row starts the pause; then even the right password is refused.
      expect((await signIn(email.toUpperCase(), 'wrong again')).statusCode).toBe(401);
      const paused = await signIn(email, PASSWORD);
      expect(paused.statusCode).toBe(429);
      expect(Number(paused.headers['retry-after'])).toBeGreaterThan(800);
      expect(paused.json()).toEqual({ message: 'Too many requests. Please try again later.' });
      expect(paused.headers['set-cookie']).toBeUndefined();

      // An address without an account pauses the same way, so the pause reveals nothing.
      const nobody = uniqueEmail('lockout-nobody');
      for (let i = 0; i < 10; i += 1)
        expect((await signIn(nobody, `wrong ${String(i)}`)).statusCode).toBe(401);
      const refused = await signIn(nobody, PASSWORD);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual(paused.json());

      // Other accounts sign in as usual.
      const other = await verifiedUser('lockout-other');
      expect((await signIn(other.email, PASSWORD)).statusCode).toBe(200);
    });

    it('fails closed when Valkey is unreachable', async () => {
      const limited = await boot(services, mailer, {
        auth: { rateLimit: true, codeRequestLimit: true },
      });
      try {
        limited.get<Redis>(VALKEY).disconnect();
        const client = new TestBrowser(limited, { origin: CONSOLE, ip: randomIp() });
        const signIn = await client.post('/v1/auth/sign-in/email', {
          email: uniqueEmail('closed'),
          password: 'whatever password',
        });
        expect(signIn.statusCode).toBe(429);
        const code = await client.post('/v1/auth/email-otp/send-verification-otp', {
          email: uniqueEmail('closed'),
          type: 'sign-in',
        });
        expect(code.statusCode).toBe(429);
      } finally {
        await limited.close();
      }
    });

    it('refuses password sign-in when the per-address pause cannot be checked', async () => {
      // Better Auth's own limiter off, so the refusal can only come from the pause (ADR-034).
      const limited = await boot(services, mailer, {
        auth: { rateLimit: false, codeRequestLimit: false },
      });
      try {
        const { email } = await verifiedUser('lockout-closed');
        limited.get<Redis>(VALKEY).disconnect();
        const client = new TestBrowser(limited, { origin: CONSOLE, ip: randomIp() });
        const signIn = await client.post('/v1/auth/sign-in/email', { email, password: PASSWORD });
        expect(signIn.statusCode).toBe(429);
      } finally {
        await limited.close();
      }
    });
  });
});
