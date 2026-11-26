import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Redis } from 'ioredis';
import { decode } from 'notepack.io';
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
import { type RealtimeEnvelope, uuidv7 } from '@radd/shared';
import { type RealtimePublisher } from '@radd/shared/realtime-publisher';

import { createApp } from '../src/app.factory';
import { latestCode, randomIp, TestBrowser, uniqueEmail } from './support/auth-client';
import { testEnv } from './support/env';
import { TestRoutesModule } from './support/test-routes.module';
import { REALTIME_PUBLISHER } from '../src/outbox/outbox.service';

const runtime = await detectIntegrationRuntime(['postgres', 'valkey']);

const CONSOLE = 'http://localhost:3001';
const PASSWORD = 'correct horse battery';

interface Emitted {
  channel: string;
  namespace: string;
  rooms: string[];
  envelope: RealtimeEnvelope;
}

describe.skipIf(!runtime.ready)('outbox fast path (ARCHITECTURE §8, ADR-028)', () => {
  let postgres: StartedService;
  let valkey: StartedService;
  let database: TestDatabase;
  let sql: DbHandle;
  let app: NestFastifyApplication;
  let subscriber: Redis;
  const mailer = new MemoryMailer();
  const emitted: Emitted[] = [];

  const query = async <T>(text: string, values: unknown[] = []): Promise<T[]> =>
    (await sql.pool.query(text, values)).rows as T[];
  const key = () => ({ 'idempotency-key': uuidv7() });
  const dispatched = async (ids: readonly string[]) =>
    (
      await query<{ id: string; dispatched: boolean }>(
        `select id::text, dispatched_at is not null as dispatched
           from outbox_events where id = any($1::bigint[]) order by id`,
        [ids],
      )
    ).map((row) => row.dispatched);
  /** Waits until `count` messages for `eventIds` have arrived (delivery to the subscriber is async). */
  const received = async (eventIds: readonly string[], count: number) => {
    const mine = () => emitted.filter((message) => eventIds.includes(message.envelope.eventId));
    for (let tries = 0; mine().length < count && tries < 100; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return mine();
  };

  async function owner(label: string) {
    const client = new TestBrowser(app, { origin: CONSOLE, ip: randomIp() });
    const email = uniqueEmail(label);
    await client.post('/v1/auth/sign-up/email', { name: label, email, password: PASSWORD });
    const otp = await latestCode(app, mailer, email);
    await client.post('/v1/auth/email-otp/verify-email', { email, otp });
    const created = await client.post('/v1/organizations', { name: `${label} House` }, key());
    expect(created.statusCode, created.body).toBe(201);
    return { client, orgId: created.json<{ id: string }>().id };
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
      { mailer, auth: { rateLimit: false, codeRequestLimit: false }, imports: [TestRoutesModule] },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // What a Socket.IO server's Redis adapter would receive.
    subscriber = new Redis(valkey.url);
    subscriber.on('pmessageBuffer', (_pattern: Buffer, channel: Buffer, message: Buffer) => {
      const [, packet, options] = decode(message) as [
        string,
        { data: [string, RealtimeEnvelope]; nsp: string },
        { rooms: string[] },
      ];
      emitted.push({
        channel: channel.toString(),
        namespace: packet.nsp,
        rooms: options.rooms,
        envelope: packet.data[1],
      });
    });
    await subscriber.psubscribe('socket.io#*');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await subscriber.quit();
    await app.close();
    await sql.close();
    await database.drop();
    await Promise.all([postgres.stop(), valkey.stop()]);
  });

  it('emits each event after commit, in order, and marks it dispatched', async () => {
    const o = await owner('fast');
    const res = await o.client.post('/v1/__test/tenant/outbox', { count: 3 });
    expect(res.statusCode, res.body).toBe(201);
    const { ids, sessionId } = res.json<{ ids: string[]; sessionId: string }>();
    expect(await dispatched(ids)).toEqual([true, true, true]);

    // Each event goes to the staff namespace (imports + session room) and the diner namespace
    // (session room only): two messages per event.
    const messages = await received(ids, 6);
    expect(messages).toHaveLength(6);
    const staff = messages.filter((message) => message.namespace === '/staff');
    expect(staff.map((message) => message.envelope.eventId)).toEqual(ids);
    expect(staff[0]).toEqual({
      channel: 'socket.io#/staff#',
      namespace: '/staff',
      rooms: [`org:${o.orgId}:imports`, `session:${sessionId}`],
      envelope: {
        eventId: ids[0],
        type: 'test.changed',
        aggregate: { type: 'test', id: sessionId },
        occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
        payload: { n: 0 },
      },
    });
    const diner = messages.filter((message) => message.namespace === '/diner');
    expect(diner.map((message) => message.channel)).toEqual(
      ids.map(() => `socket.io#/diner#session:${sessionId}#`),
    );
    // No staff-only room ever goes to the diner namespace.
    expect(diner.flatMap((message) => message.rooms)).toEqual(
      ids.map(() => `session:${sessionId}`),
    );
  });

  it('never writes or emits an event whose transaction rolled back', async () => {
    const o = await owner('rolled');
    const before = emitted.length;
    const res = await o.client.post('/v1/__test/tenant/outbox', { count: 2, fail: true });
    expect(res.statusCode).toBe(409);
    expect(
      await query('select 1 from outbox_events where organization_id = $1', [o.orgId]),
    ).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      emitted.slice(before).filter((message) => message.rooms.includes(`org:${o.orgId}:imports`)),
    ).toEqual([]);
  });

  it('leaves what Valkey refused for the worker, without failing the request', async () => {
    const o = await owner('refused');
    const publisher = app.get<RealtimePublisher>(REALTIME_PUBLISHER);
    // The first event goes out; the second is refused, so the third is held back to keep order.
    const publish = vi
      .spyOn(publisher, 'publish')
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.reject(new Error('Connection is closed.')));
    const res = await o.client.post('/v1/__test/tenant/outbox', { count: 3 });
    expect(res.statusCode, res.body).toBe(201);
    const { ids } = res.json<{ ids: string[] }>();
    expect(publish).toHaveBeenCalledTimes(2);
    expect(await dispatched(ids)).toEqual([true, false, false]);
  });
});
