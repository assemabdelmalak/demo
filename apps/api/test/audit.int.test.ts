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
import { REQUEST_ID_HEADER, uuidv7 } from '@radd/shared';

import { createApp } from '../src/app.factory';
import { latestCode, randomIp, TestBrowser, uniqueEmail } from './support/auth-client';
import { testEnv } from './support/env';
import { TestRoutesModule } from './support/test-routes.module';
import { auditIpHash, REDACTED } from '../src/audit/audit-state';

const runtime = await detectIntegrationRuntime(['postgres', 'valkey']);

const CONSOLE = 'http://localhost:3001';
const PASSWORD = 'correct horse battery';
const ENV = testEnv();

interface AuditRow {
  organization_id: string | null;
  restaurant_id: string | null;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip_hash: string | null;
  request_id: string | null;
}

describe.skipIf(!runtime.ready)('audit log (P1-T07, SECURITY T8)', () => {
  let postgres: StartedService;
  let valkey: StartedService;
  let database: TestDatabase;
  let sql: DbHandle;
  let app: NestFastifyApplication;
  const mailer = new MemoryMailer();
  /** Every client IP this suite used; none may appear in any audit row. */
  const ips: string[] = [];

  const query = async <T>(text: string, values: unknown[] = []): Promise<T[]> =>
    (await sql.pool.query(text, values)).rows as T[];
  const key = () => ({ 'idempotency-key': uuidv7() });
  const entry = async (action: string, entityId: string) => {
    const rows = await query<AuditRow>(
      `select organization_id, restaurant_id, actor_type, actor_id, action, entity_type, entity_id,
              before, after, ip_hash, request_id
         from audit_logs where action = $1 and entity_id = $2`,
      [action, entityId],
    );
    expect(rows, `${action} ${entityId}`).toHaveLength(1);
    return rows[0] as AuditRow;
  };

  /** A verified owner with an organisation, signed in from a known IP. */
  async function owner(label: string) {
    const ip = randomIp();
    ips.push(ip);
    const client = new TestBrowser(app, { origin: CONSOLE, ip });
    const email = uniqueEmail(label);
    await client.post('/v1/auth/sign-up/email', { name: label, email, password: PASSWORD });
    const otp = await latestCode(app, mailer, email);
    await client.post('/v1/auth/email-otp/verify-email', { email, otp });
    const [user] = await query<{ id: string }>('select id from "user" where email = $1', [email]);
    if (!user) throw new Error('no user');
    const created = await client.post('/v1/organizations', { name: `${label} House` }, key());
    expect(created.statusCode, created.body).toBe(201);
    return { client, ip, userId: user.id, org: created.json<{ id: string }>(), created };
  }

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
        imports: [TestRoutesModule],
      },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await sql.close();
    await database.drop();
    await Promise.all([postgres.stop(), valkey.stop()]);
  });

  it('records the actor, organisation, restaurant, request ID and a keyed IP hash', async () => {
    const o = await owner('enriched');
    const ipHash = auditIpHash(ENV.ACTOR_HASH_SECRET, o.ip);

    expect(await entry('organization.create', o.org.id)).toMatchObject({
      organization_id: o.org.id,
      restaurant_id: null,
      actor_type: 'user',
      actor_id: o.userId,
      entity_type: 'organization',
      before: null,
      after: expect.objectContaining({ id: o.org.id, name: 'enriched House' }) as unknown,
      ip_hash: ipHash,
      request_id: o.created.headers[REQUEST_ID_HEADER],
    });

    const slug = `audit-${String(Date.now())}`;
    const restaurant = await o.client.post('/v1/restaurants', { name: { en: slug }, slug }, key());
    expect(restaurant.statusCode).toBe(201);
    const restaurantId = restaurant.json<{ id: string }>().id;
    expect(await entry('restaurant.create', restaurantId)).toMatchObject({
      organization_id: o.org.id,
      restaurant_id: restaurantId,
      actor_id: o.userId,
      after: expect.objectContaining({ slug }) as unknown,
      ip_hash: ipHash,
      request_id: restaurant.headers[REQUEST_ID_HEADER],
    });

    const renamed = await o.client.patch('/v1/organizations/current', { name: 'Renamed House' });
    expect(renamed.statusCode).toBe(200);
    const rename = await query<AuditRow>(
      `select before, after from audit_logs where action = 'organization.update' and entity_id = $1`,
      [o.org.id],
    );
    expect(rename).toEqual([
      {
        before: expect.objectContaining({ name: 'enriched House' }) as unknown,
        after: expect.objectContaining({ name: 'Renamed House' }) as unknown,
      },
    ]);

    const invitee = uniqueEmail('invitee');
    const invited = await o.client.post(
      '/v1/invitations',
      { email: invitee, role: 'staff' },
      key(),
    );
    expect(invited.statusCode, invited.body).toBe(201);
    const invitation = await entry('invitation.create', invited.json<{ id: string }>().id);
    expect(invitation).toMatchObject({ organization_id: o.org.id, after: { role: 'staff' } });
    // The invitee's address stays on the invitation, not in the log.
    expect(JSON.stringify(invitation)).not.toContain(invitee);
  });

  it('rolls an entry back together with the change it describes', async () => {
    const o = await owner('rollback');
    const slug = `rolled-${String(Date.now())}`;
    const res = await o.client.post('/v1/__test/tenant/audit-then-throw', { slug });
    expect(res.statusCode).toBe(409);
    expect(await query('select 1 from restaurants where slug = $1', [slug])).toEqual([]);
    expect(
      await query(
        `select 1 from audit_logs where action = 'test.rolled_back' and after->>'slug' = $1`,
        [slug],
      ),
    ).toEqual([]);
  });

  it('never stores a raw IP, a credential or a payment reference', async () => {
    const o = await owner('sensitive');
    const res = await o.client.post('/v1/__test/tenant/audit-sensitive');
    expect(res.statusCode, res.body).toBe(201);
    const stored = await entry('test.sensitive', res.json<{ id: string }>().id);
    expect(stored.after).toEqual({
      amountMinor: 1500,
      externalReference: REDACTED,
      pin: REDACTED,
      session: { token: REDACTED },
      clientIp: REDACTED,
      note: REDACTED,
    });

    // Across every entry this suite wrote: no address, reference, PIN or token in any column.
    const all = await query<{ row: string }>('select to_jsonb(a)::text as row from audit_logs a');
    expect(all.length).toBeGreaterThan(5);
    const text = all.map((row) => row.row).join('\n');
    for (const ip of ips) expect(text).not.toContain(ip);
    for (const secret of ['WHISH-55501234', 'pin-zqx-7731', 'secret-session-token']) {
      expect(text).not.toContain(secret);
    }
  });

  it('does not let the API role read, change or remove entries outside its tenant', async () => {
    const runtimeDb = createDb({ url: database.urls.runtime, max: 1 });
    try {
      // Without a tenant the runtime role reads nothing, and it may never update or delete.
      expect(
        (await runtimeDb.pool.query('select count(*)::int as n from audit_logs')).rows,
      ).toEqual([{ n: 0 }]);
      await expect(runtimeDb.pool.query(`update audit_logs set action = 'x'`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(runtimeDb.pool.query('delete from audit_logs')).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await runtimeDb.close();
    }
  });
});
