import { type INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { decode } from 'notepack.io';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  detectIntegrationRuntime,
  startPostgres,
  startValkey,
  type StartedService,
} from '@radd/config/testing';
import { createDb, type DbHandle, OutboxRepository, withTenant } from '@radd/db';
import { createOrganization, createTestDatabase, type TestDatabase } from '@radd/db/testing';
import { MemoryMailer } from '@radd/mail';
import { QUEUE_PREFIX, type RealtimeEnvelope, realtimeRooms, uuidv7 } from '@radd/shared';
import { RedisEmitterPublisher, type RealtimePublisher } from '@radd/shared/realtime-publisher';

import { freePort, testEnv } from './env';
import { OUTBOX_DISPATCH_SCHEDULER } from '../src/outbox/outbox-dispatch.processor';
import { DEFAULT_OUTBOX_DISPATCH, OutboxDispatcher } from '../src/outbox/outbox-dispatcher';
import { WorkerModule } from '../src/worker.module';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

const runtime = await detectIntegrationRuntime(['postgres', 'valkey']);

interface Emitted {
  namespace: string;
  rooms: string[];
  envelope: RealtimeEnvelope;
}

describe.skipIf(!runtime.ready)('outbox.dispatch (ADR-028)', () => {
  let postgres: StartedService;
  let valkey: StartedService;
  let database: TestDatabase;
  let admin: DbHandle;
  /** What the API connects as: it writes the events. */
  let api: DbHandle;
  /** What the worker connects as. */
  let worker: DbHandle;
  let publisherConnection: Redis;
  let subscriber: Redis;
  let orgId: string;
  const emitted: Emitted[] = [];
  const outbox = new OutboxRepository();

  /** An event the API committed and never emitted: the process stopped in between. */
  async function committedNotEmitted(secondsAgo = 10, n = 0) {
    const sessionId = uuidv7();
    const row = await withTenant(api.db, orgId, () =>
      outbox.add({
        aggregateType: 'session',
        aggregateId: sessionId,
        type: 'session.updated',
        payload: { sessionVersion: n },
        rooms: [realtimeRooms.session(sessionId)],
      }),
    );
    await admin.pool.query(
      `update outbox_events set created_at = now() - make_interval(secs => $2) where id = $1`,
      [row.id, secondsAgo],
    );
    return row.id;
  }

  const dispatched = async (ids: readonly string[]) =>
    (
      await admin.pool.query<{ dispatched: boolean }>(
        `select dispatched_at is not null as dispatched
           from outbox_events where id = any($1::bigint[]) order by id`,
        [ids],
      )
    ).rows.map((row) => row.dispatched);

  const emittedFor = (id: string) => emitted.filter((message) => message.envelope.eventId === id);

  const dispatcher = (publisher: RealtimePublisher, overrides = {}) =>
    new OutboxDispatcher(worker, publisher, { ...DEFAULT_OUTBOX_DISPATCH, ...overrides });

  beforeAll(async () => {
    // The dispatcher is also used outside a Nest app here, where its logger would print.
    Logger.overrideLogger(false);
    [postgres, valkey] = await Promise.all([startPostgres(), startValkey()]);
    database = await createTestDatabase(postgres.url);
    admin = createDb({ url: database.urls.admin, max: 2 });
    api = createDb({ url: database.urls.runtime, max: 2 });
    worker = createDb({ url: database.urls.worker, max: 2 });
    orgId = (await createOrganization(admin.db)).id;
    publisherConnection = new Redis(valkey.url);

    subscriber = new Redis(valkey.url);
    subscriber.on('pmessageBuffer', (_pattern: Buffer, _channel: Buffer, message: Buffer) => {
      const [, packet, options] = decode(message) as [
        string,
        { data: [string, RealtimeEnvelope]; nsp: string },
        { rooms: string[] },
      ];
      emitted.push({ namespace: packet.nsp, rooms: options.rooms, envelope: packet.data[1] });
    });
    await subscriber.psubscribe('socket.io#*');
  });

  afterAll(async () => {
    await subscriber.quit();
    await publisherConnection.quit();
    await Promise.all([admin.close(), api.close(), worker.close()]);
    await database.drop();
    await Promise.all([postgres.stop(), valkey.stop()]);
  });

  it('re-emits an event committed but never emitted, and marks it dispatched', async () => {
    const id = await committedNotEmitted();
    const fresh = await committedNotEmitted(0);
    const result = await dispatcher(new RedisEmitterPublisher(publisherConnection)).run();

    expect(result).toEqual({ claimed: 1, dispatched: 1, undeliverable: 0 });
    expect(await dispatched([id, fresh])).toEqual([true, false]);
    for (let tries = 0; emittedFor(id).length < 2 && tries < 100; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // A session room lives in both namespaces.
    expect(
      emittedFor(id)
        .map((message) => message.namespace)
        .sort(),
    ).toEqual(['/diner', '/staff']);
    expect(emittedFor(id)[0]?.envelope).toMatchObject({
      eventId: id,
      type: 'session.updated',
      aggregate: { type: 'session' },
      payload: { sessionVersion: 0 },
    });

    // A younger event is still the API's; nothing is sent twice by the next run.
    expect(await dispatcher(new RedisEmitterPublisher(publisherConnection)).run()).toEqual({
      claimed: 0,
      dispatched: 0,
      undeliverable: 0,
    });
    await admin.pool.query('update outbox_events set dispatched_at = now() where id = $1', [fresh]);
  });

  it('stops at the first event Valkey refuses and sends the rest, in order, next time', async () => {
    const ids = [
      await committedNotEmitted(10, 1),
      await committedNotEmitted(10, 2),
      await committedNotEmitted(10, 3),
    ];
    const order: string[] = [];
    let refuseNext = false;
    const flaky: RealtimePublisher = {
      publish: (event) => {
        if (refuseNext) {
          refuseNext = false;
          return Promise.reject(new Error('Connection is closed.'));
        }
        order.push(event.envelope.eventId);
        // The second event is refused.
        if (order.length === 1) refuseNext = true;
        return Promise.resolve();
      },
    };

    await expect(dispatcher(flaky).run()).rejects.toThrow('outbox publish failed after 1 events');
    // What was sent before the failure stays marked; the rest waits.
    expect(await dispatched(ids)).toEqual([true, false, false]);

    expect(await dispatcher(flaky).run()).toEqual({ claimed: 2, dispatched: 2, undeliverable: 0 });
    expect(order).toEqual(ids);
    expect(await dispatched(ids)).toEqual([true, true, true]);
  });

  it('sets an undeliverable event aside instead of blocking every event behind it', async () => {
    // Written past the API's validation, as an older version might have: an unknown room.
    const { rows } = await admin.pool.query<{ id: string }>(
      `insert into outbox_events (organization_id, aggregate_type, aggregate_id, type, payload, room, created_at)
       values ($1, 'session', $2, 'session.updated', '{}', '{everyone}', now() - interval '10 s')
       returning id::text`,
      [orgId, uuidv7()],
    );
    const bad = rows[0]?.id ?? '';
    const good = await committedNotEmitted(9);
    const sent: string[] = [];
    const recording: RealtimePublisher = {
      publish: (event) => {
        sent.push(event.envelope.eventId);
        return Promise.resolve();
      },
    };

    expect(await dispatcher(recording).run()).toEqual({
      claimed: 2,
      dispatched: 1,
      undeliverable: 1,
    });
    expect(sent).toEqual([good]);
    expect(await dispatched([bad, good])).toEqual([true, true]);
  });

  it('drains a backlog larger than one batch in one run', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 5; n += 1) ids.push(await committedNotEmitted(10, n));
    const result = await dispatcher(
      { publish: () => Promise.resolve() },
      { batchSize: 2, maxBatches: 10 },
    ).run();
    expect(result).toEqual({ claimed: 5, dispatched: 5, undeliverable: 0 });
    expect(await dispatched(ids)).toEqual([true, true, true, true, true]);
  });

  describe('in the running worker', () => {
    let app: INestApplicationContext | undefined;
    let queue: Queue | undefined;

    afterAll(async () => {
      await app?.close();
      // Locally Valkey is shared between test runs: leave no schedule behind.
      await queue?.removeJobScheduler(OUTBOX_DISPATCH_SCHEDULER);
      await queue?.close();
    });

    it('repairs a crash between commit and emit on its 5-second schedule, as app_worker', async () => {
      const id = await committedNotEmitted();
      const env = testEnv({
        DATABASE_URL_WORKER: database.urls.worker,
        REDIS_URL: valkey.url,
        WORKER_HEALTH_PORT: String(await freePort()),
      });
      app = await NestFactory.createApplicationContext(
        // A faster tick than production's 5 s, so the test does not wait.
        WorkerModule.register(env, {
          mailer: new MemoryMailer(),
          outbox: { dispatch: { everyMs: 200 } },
        }),
        { logger: false },
      );
      await app.init();
      queue = new Queue('outbox.dispatch', {
        connection: { url: valkey.url },
        prefix: QUEUE_PREFIX,
      });

      for (let tries = 0; !(await dispatched([id]))[0] && tries < 100; tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(await dispatched([id])).toEqual([true]);
      expect(emittedFor(id).length).toBeGreaterThan(0);
      expect(await queue.getJobScheduler(OUTBOX_DISPATCH_SCHEDULER)).toMatchObject({
        every: 200,
      });

      const { rows } = await admin.pool.query<{ usename: string }>(
        `select distinct usename::text from pg_stat_activity where application_name = 'radd-worker'`,
      );
      expect(rows).toEqual([{ usename: 'app_worker' }]);
    });
  });
});
