import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { detectIntegrationRuntime, startValkey, type StartedService } from '@radd/config/testing';
import { DEFAULT_JOB_OPTIONS, QUEUE_PREFIX, type QueuePayloadInput } from '@radd/shared';

import { freePort, testEnv } from './env';
import { HeartbeatService } from '../src/health/heartbeat.service';
import { ProbeServer } from '../src/health/probe.server';
import { WorkerModule } from '../src/worker.module';

const runtime = await detectIntegrationRuntime(['valkey']);

async function startWorker(redisUrl: string): Promise<INestApplicationContext> {
  const env = testEnv({ REDIS_URL: redisUrl, WORKER_HEALTH_PORT: String(await freePort()) });
  const app = await NestFactory.createApplicationContext(WorkerModule.register(env), {
    logger: false,
  });
  await app.init();
  return app;
}

describe.skipIf(!runtime.ready)('worker', () => {
  let valkey: StartedService;
  let app: INestApplicationContext;
  let producerConnection: Redis;
  let queue: Queue;
  let events: QueueEvents;

  const enqueue = (data: QueuePayloadInput<'noop'>) => queue.add('noop', data);

  beforeAll(async () => {
    valkey = await startValkey();
    // Same registry, prefix and default options the API's QueueProducer uses.
    producerConnection = new Redis(valkey.url, { maxRetriesPerRequest: null });
    queue = new Queue('noop', {
      connection: producerConnection,
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    events = new QueueEvents('noop', { connection: { url: valkey.url }, prefix: QUEUE_PREFIX });
    await events.waitUntilReady();
    app = await startWorker(valkey.url);
  });

  afterAll(async () => {
    await app.close();
    await events.close();
    await queue.close();
    producerConnection.disconnect();
    await valkey.stop();
  });

  it('processes a noop job', async () => {
    const job = await enqueue({ message: 'hello from the API' });
    await expect(job.waitUntilFinished(events, 10_000)).resolves.toEqual({
      echo: 'hello from the API',
    });
  });

  it('retries a failing job three times with exponential backoff, then marks it failed', async () => {
    const started = Date.now();
    const job = await enqueue({ message: 'boom', fail: true });
    await expect(job.waitUntilFinished(events, 15_000)).rejects.toThrow(
      /noop failure requested \(attempt 3\)/,
    );
    const failed = await queue.getJob(job.id ?? '');
    expect(await failed?.getState()).toBe('failed');
    expect(failed?.attemptsMade).toBe(3);
    // Backoff of 1 s then 2 s between the three attempts.
    expect(Date.now() - started).toBeGreaterThanOrEqual(3_000);
  });

  it('does not retry a job whose payload is invalid', async () => {
    const job = await queue.add('noop', { message: '' });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(/invalid noop payload/);
    expect((await queue.getJob(job.id ?? ''))?.attemptsMade).toBe(1);
  });

  it('writes a heartbeat and reports healthy on the probe port', async () => {
    const heartbeat = app.get(HeartbeatService);
    const reader = new Redis(valkey.url);
    try {
      expect(await reader.get(heartbeat.key)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(await reader.pttl(heartbeat.key)).toBeGreaterThan(0);
    } finally {
      reader.disconnect();
    }

    const { port } = app.get(ProbeServer);
    const res = await fetch(`http://127.0.0.1:${String(port)}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
    expect((await fetch(`http://127.0.0.1:${String(port)}/other`)).status).toBe(404);
  });

  it('drains: shutting down waits for the active job to finish', async () => {
    // Run the job on a worker of its own, so closing it is the only thing under test.
    await app.close();
    const draining = await startWorker(valkey.url);

    const job = await enqueue({ message: 'slow', delayMs: 1_500 });
    while ((await job.getState()) !== 'active')
      await new Promise((resolve) => setTimeout(resolve, 50));

    await draining.close();
    expect(await job.getState()).toBe('completed');
    expect((await queue.getJob(job.id ?? ''))?.returnvalue).toEqual({ echo: 'slow' });

    app = await startWorker(valkey.url);
  });
});
