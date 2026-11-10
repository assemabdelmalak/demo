import { expect, test } from '@playwright/test';

/** Runs only where the whole stack is up (CI e2e-smoke): API ready means Postgres, Valkey and queues answer. */
test.describe('full stack @smoke', () => {
  test.skip(!process.env.E2E_API_URL, 'set E2E_API_URL to run against a running API');

  test('API is live and ready', async ({ request }) => {
    expect((await request.get('/v1/health/live')).status()).toBe(200);
    const ready = await request.get('/v1/health/ready');
    expect(await ready.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', valkey: 'ok', queue: 'ok' },
    });
  });

  test('worker probe is healthy', async ({ request }) => {
    const res = await request.get(process.env.E2E_WORKER_URL ?? 'http://localhost:4100/healthz');
    expect(res.status()).toBe(200);
  });
});
