import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { detectIntegrationRuntime, startValkey, type StartedService } from '@radd/config/testing';

import { createApp } from '../src/app.factory';
import { testEnv } from './support/env';
import { QueueProducer } from '../src/queues/queue-producer';

const runtime = await detectIntegrationRuntime(['valkey']);

describe.skipIf(!runtime.ready)('QueueProducer', () => {
  let valkey: StartedService;
  let app: NestFastifyApplication;
  let producer: QueueProducer;

  beforeAll(async () => {
    valkey = await startValkey();
    app = await createApp(testEnv({ REDIS_URL: valkey.url }));
    await app.init();
    producer = app.get(QueueProducer);
  });

  afterAll(async () => {
    await app.close();
    await valkey.stop();
  });

  it('enqueues a validated noop job with the default retry policy', async () => {
    const id = await producer.enqueue('noop', { message: 'from the API' });
    const job = await producer.queue('noop').getJob(id);
    expect(job?.data).toEqual({ message: 'from the API', fail: false, delayMs: 0 });
    expect(job?.opts.attempts).toBe(3);
    expect(job?.opts.backoff).toEqual({ type: 'exponential', delay: 1_000 });
    expect(await job?.getState()).toBe('waiting');
  });

  it('rejects payloads that do not match the registry', async () => {
    await expect(producer.enqueue('noop', { message: '' })).rejects.toThrow();
    await expect(
      producer.enqueue('menu.publish', { restaurantId: 'r1' } as never),
    ).rejects.toThrow();
  });
});
