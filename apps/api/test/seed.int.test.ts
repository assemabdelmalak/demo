import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  detectIntegrationRuntime,
  startPostgres,
  startValkey,
  type StartedService,
} from '@radd/config/testing';
import { runSeed, SEED_IDS, SEED_MEMBERS, SEED_SUPER_ADMIN, type SeedReport } from '@radd/db/seed';
import { createTestDatabase, type TestDatabase } from '@radd/db/testing';
import { MemoryMailer } from '@radd/mail';
import { uuidv7 } from '@radd/shared';

import { createApp } from '../src/app.factory';
import { randomIp, TestBrowser, totp } from './support/auth-client';
import { testEnv } from './support/env';

const runtime = await detectIntegrationRuntime(['postgres', 'valkey']);

const CONSOLE = 'http://localhost:3001';

/** P1-T08: the seeded accounts work through the API exactly like ones made by signing up. */
describe.skipIf(!runtime.ready)('the Beit Tayta seed through the API', () => {
  let postgres: StartedService;
  let valkey: StartedService;
  let database: TestDatabase;
  let app: NestFastifyApplication;
  let report: SeedReport;
  const env = testEnv();
  const browser = () => new TestBrowser(app, { origin: CONSOLE, ip: randomIp() });
  const key = () => ({ 'idempotency-key': uuidv7() });

  async function signIn(email: string, password: string): Promise<TestBrowser> {
    const client = browser();
    const res = await client.post('/v1/auth/sign-in/email', { email, password });
    expect(res.statusCode, res.body).toBe(200);
    return client;
  }

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([startPostgres(), startValkey()]);
    database = await createTestDatabase(postgres.url);
    // The API's own secret: PIN hashes and the TOTP secret only verify under it.
    report = await runSeed({
      runtimeUrl: database.urls.runtime,
      adminUrl: database.urls.admin,
      authSecret: env.BETTER_AUTH_SECRET,
      appEnv: 'test',
    });
    app = await createApp(
      testEnv({
        DATABASE_URL: database.urls.runtime,
        DATABASE_URL_ADMIN: database.urls.admin,
        REDIS_URL: valkey.url,
        CONSOLE_PUBLIC_URL: CONSOLE,
        SUPER_ADMIN_EMAILS: SEED_SUPER_ADMIN.email,
      }),
      { mailer: new MemoryMailer(), auth: { rateLimit: false, codeRequestLimit: false } },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
    await Promise.all([postgres.stop(), valkey.stop()]);
  });

  it.each(SEED_MEMBERS.map((member) => [member.role, member] as const))(
    'signs the %s in with the SEED_DATA password, in Beit Tayta',
    async (role, member) => {
      const client = await signIn(member.email, member.password);
      const me = await client.get('/v1/me');
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({
        user: { email: member.email, emailVerified: true, twoFactorEnabled: false },
        session: { activeOrganizationId: SEED_IDS.organization, pinSession: false },
        isSuperAdmin: false,
        memberships: [
          {
            organizationId: SEED_IDS.organization,
            name: 'Beit Tayta SAL',
            slug: 'beit-tayta',
            role,
          },
        ],
      });
      const wrong = await browser().post('/v1/auth/sign-in/email', {
        email: member.email,
        password: `${member.password}x`,
      });
      expect(wrong.statusCode).toBe(401);
    },
  );

  it('lets the super admin in with the printed TOTP seed, and shows Beit Tayta on pro', async () => {
    const admin = report.superAdmin;
    if (!admin) throw new Error('no super admin seeded');
    const client = browser();
    const signIn = await client.post('/v1/auth/sign-in/email', {
      email: admin.email,
      password: admin.password,
    });
    expect(signIn.json()).toMatchObject({ twoFactorRedirect: true });
    const verify = await client.post('/v1/auth/two-factor/verify-totp', {
      code: totp(admin.totpSecret),
    });
    expect(verify.statusCode, verify.body).toBe(200);
    expect((await client.get('/v1/me')).json()).toMatchObject({
      isSuperAdmin: true,
      memberships: [],
    });
    const orgs = await client.get('/v1/admin/orgs?search=Beit');
    expect(orgs.statusCode).toBe(200);
    expect(orgs.json()).toMatchObject({
      items: [{ id: SEED_IDS.organization, plan: 'pro', status: 'active', memberCount: 4 }],
    });
  });

  it('switches the staff member onto a registered tablet with PIN 1234', async () => {
    const manager = SEED_MEMBERS.find((member) => member.role === 'manager');
    if (!manager) throw new Error('no manager');
    const tablet = await signIn(manager.email, manager.password);
    const device = await tablet.post(
      `/v1/restaurants/${SEED_IDS.restaurant}/staff-devices`,
      { name: 'Pass tablet' },
      key(),
    );
    expect(device.statusCode, device.body).toBe(201);
    const deviceId = device.json<{ id: string }>().id;

    const switched = await tablet.post(`/v1/staff-devices/${deviceId}/switch`, {
      memberId: SEED_IDS.members.staff,
      pin: '1234',
    });
    expect(switched.statusCode, switched.body).toBe(200);
    expect((await tablet.get('/v1/me')).json()).toMatchObject({
      user: { id: SEED_IDS.users.staff },
      session: { pinSession: true, staffDeviceId: deviceId },
      memberships: [{ organizationId: SEED_IDS.organization, role: 'staff' }],
    });
  });
});
