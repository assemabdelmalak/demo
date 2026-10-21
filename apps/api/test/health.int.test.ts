import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  detectIntegrationRuntime,
  startPostgres,
  startValkey,
  type StartedService,
} from '@radd/config/testing';

import { createApp } from '../src/app.factory';
import { testEnv } from './support/env';

const valkeyRuntime = await detectIntegrationRuntime(['valkey']);
const fullRuntime = await detectIntegrationRuntime(['postgres', 'valkey']);

const REAL_SECRET = 'x'.repeat(48);
const PRODUCTION_SECRETS = Object.fromEntries(
  [
    'BETTER_AUTH_SECRET',
    'PARTICIPANT_TOKEN_SECRET',
    'DEVICE_COOKIE_SECRET',
    'RECEIPT_TOKEN_SECRET',
    'DINER_REVALIDATE_SECRET',
    'ACTOR_HASH_SECRET',
    'TRACE_SAMPLING_SECRET',
  ].map((key) => [key, REAL_SECRET]),
);

async function boot(overrides: Record<string, string>): Promise<NestFastifyApplication> {
  const app = await createApp(testEnv(overrides));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe.skipIf(!fullRuntime.ready)('GET /v1/health/ready with every dependency up', () => {
  let postgres: StartedService;
  let valkey: StartedService;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([startPostgres(), startValkey()]);
    app = await boot({ DATABASE_URL: postgres.url, REDIS_URL: valkey.url });
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([postgres.stop(), valkey.stop()]);
  });

  it('answers 200 with every check ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', valkey: 'ok', queue: 'ok' },
    });
  });
});

describe.skipIf(!valkeyRuntime.ready)('health and docs without a database', () => {
  let valkey: StartedService;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    valkey = await startValkey();
    // Nothing listens on port 1: the database check must fail fast, not hang.
    app = await boot({
      DATABASE_URL: 'postgres://app_runtime:x@127.0.0.1:1/radd',
      REDIS_URL: valkey.url,
    });
  });

  afterAll(async () => {
    await app.close();
    await valkey.stop();
  });

  it('reports 503 and names the failing dependency without details', async () => {
    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: '/v1/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'error',
      checks: { database: 'error', valkey: 'ok', queue: 'ok' },
    });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('keeps liveness independent of dependencies', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/health/live' })).statusCode).toBe(200);
  });

  it('serves Swagger UI and the OpenAPI document outside production', async () => {
    const ui = await app.inject({ method: 'GET', url: '/v1/docs' });
    expect(ui.statusCode).toBe(200);
    expect(ui.headers['content-type']).toContain('text/html');

    const json = await app.inject({ method: 'GET', url: '/v1/docs/openapi.json' });
    expect(json.statusCode).toBe(200);
    const document = json.json<{ openapi: string; paths: Record<string, unknown> }>();
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/v1/health/live', '/v1/health/ready']),
    );
  });

  it('does not serve docs in production', async () => {
    const production = await boot({
      ...PRODUCTION_SECRETS,
      APP_ENV: 'production',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://app_runtime:x@127.0.0.1:1/radd',
      REDIS_URL: valkey.url,
    });
    try {
      expect((await production.inject({ method: 'GET', url: '/v1/docs' })).statusCode).toBe(404);
      expect(
        (await production.inject({ method: 'GET', url: '/v1/docs/openapi.json' })).statusCode,
      ).toBe(404);
    } finally {
      await production.close();
    }
  });
});
