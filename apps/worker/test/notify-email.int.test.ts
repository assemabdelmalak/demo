import { Global, type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { captureException } from '@sentry/node';
import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectIntegrationRuntime, startValkey, type StartedService } from '@radd/config/testing';
import { MemoryMailer } from '@radd/mail';
import { QUEUE_PREFIX, type QueuePayloadInput, uuidv7 } from '@radd/shared';

// The API's own producer side, so this is the real producer → worker path (P0 carry-over).
// Imported by path, test-only: a package dependency on @radd/api would make every worker build
// (and its Docker build stage) build the API too.
import { freePort, testEnv } from './env';
import { QueueProducer } from '../../api/src/queues/queue-producer';
import { QueuesModule } from '../../api/src/queues/queues.module';
import { VALKEY } from '../../api/src/valkey/valkey.module';
import { WorkerModule } from '../src/worker.module';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

const runtime = await detectIntegrationRuntime(['valkey']);

/** Stands in for the API's ValkeyModule, which needs the API's whole env to build its client. */
function apiProducerModule(connection: Redis) {
  @Global()
  @Module({ providers: [{ provide: VALKEY, useValue: connection }], exports: [VALKEY] })
  class ApiValkeyModule {}

  @Module({ imports: [ApiValkeyModule, QueuesModule] })
  class ApiProducerModule {}
  return ApiProducerModule;
}

function invitation(locale: 'en' | 'ar', to: string): QueuePayloadInput<'notify.email'> {
  return {
    template: 'invitation',
    to,
    locale,
    params: {
      organizationName: 'Beit Tayta',
      inviterName: 'Maya',
      role: 'kitchen',
      url: `http://localhost:3001/accept-invitation/${uuidv7()}`,
      days: 7,
    },
  };
}

describe.skipIf(!runtime.ready)('notify.email: API producer → worker → mailer', () => {
  let valkey: StartedService;
  let apiConnection: Redis;
  let api: INestApplicationContext;
  let worker: INestApplicationContext;
  let producer: QueueProducer;
  let events: QueueEvents;
  const mailer = new MemoryMailer();

  beforeAll(async () => {
    valkey = await startValkey();
    apiConnection = new Redis(valkey.url, { connectionName: 'radd-api-test' });
    api = await NestFactory.createApplicationContext(apiProducerModule(apiConnection), {
      logger: false,
    });
    await api.init();
    producer = api.get(QueueProducer);
    events = new QueueEvents('notify.email', {
      connection: { url: valkey.url },
      prefix: QUEUE_PREFIX,
    });
    await events.waitUntilReady();
    const env = testEnv({ REDIS_URL: valkey.url, WORKER_HEALTH_PORT: String(await freePort()) });
    worker = await NestFactory.createApplicationContext(WorkerModule.register(env, { mailer }), {
      logger: false,
    });
    await worker.init();
  });

  afterAll(async () => {
    await worker.close();
    await events.close();
    await api.close();
    await apiConnection.quit();
    await valkey.stop();
  });

  beforeEach(() => {
    vi.mocked(captureException).mockClear();
  });

  it.each([
    ['en', /invited you to Beit Tayta/, 'dir="ltr"'],
    ['ar', /يدعوك للانضمام إلى Beit Tayta/, 'dir="rtl"'],
  ] as const)('delivers an invitation in %s', async (locale, subject, dir) => {
    const to = `invitee.${uuidv7()}@radd.test`;
    const payload = invitation(locale, to);
    const id = await producer.enqueue('notify.email', payload, { jobId: `invitation-${uuidv7()}` });
    const job = await producer.queue('notify.email').getJob(id);
    await expect(job?.waitUntilFinished(events, 10_000)).resolves.toEqual({
      template: 'invitation',
    });

    const message = mailer.latestTo(to);
    expect(message?.subject).toMatch(subject);
    expect(message?.html).toContain(dir);
    expect(message?.text).toContain(payload.params.url);
    expect(message?.text).toContain(locale === 'ar' ? 'مطبخ' : 'as kitchen');
  });

  it('fails a job with an invalid payload at once, without retrying', async () => {
    // Bypasses the producer's validation, as a stale or tampered job would.
    const queue = producer.queue('notify.email');
    const job = await queue.add('notify.email', {
      template: 'invitation',
      to: 'someone@radd.test',
      locale: 'en',
      code: '123456',
    });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(
      /invalid notify.email payload/,
    );
    expect((await queue.getJob(job.id ?? ''))?.attemptsMade).toBe(1);
    expect(mailer.latestTo('someone@radd.test')).toBeUndefined();
    await vi.waitFor(() => {
      expect(captureException).toHaveBeenCalledOnce();
    });
  });

  it('retries a failed send and never puts the address or link in the error', async () => {
    const to = `flaky.${uuidv7()}@radd.test`;
    const payload = invitation('en', to);
    const send = vi
      .spyOn(mailer, 'send')
      .mockRejectedValueOnce(new Error(`550 mailbox ${to} unavailable at ${payload.params.url}`));
    try {
      const id = await producer.enqueue('notify.email', payload, {
        jobId: `invitation-${uuidv7()}`,
      });
      const job = await producer.queue('notify.email').getJob(id);
      await expect(job?.waitUntilFinished(events, 15_000)).resolves.toEqual({
        template: 'invitation',
      });
      const finished = await producer.queue('notify.email').getJob(id);
      expect(finished?.attemptsMade).toBe(2);
      const reasons = (finished?.stacktrace ?? []).join('\n');
      expect(reasons).toContain('email not sent: 550 mailbox [redacted]');
      expect(reasons).not.toContain(to);
      expect(reasons).not.toContain(payload.params.url);
    } finally {
      send.mockRestore();
    }
  });
});
