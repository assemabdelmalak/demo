import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { detectIntegrationRuntime, startValkey, type StartedService } from '@radd/config/testing';
import { isUuidV7, uuidv7 } from '@radd/shared';

import { createApp } from '../src/app.factory';
import { testEnv } from './support/env';
import { calls, TestRoutesModule } from './support/test-routes.module';
import { IdempotencyStore } from '../src/idempotency/idempotency.store';

const runtime = await detectIntegrationRuntime(['valkey']);

const ORDER = { item: 'fattoush', qty: 2 };

describe.skipIf(!runtime.ready)('API skeleton', () => {
  let valkey: StartedService;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    valkey = await startValkey();
    app = await createApp(testEnv({ REDIS_URL: valkey.url }), { imports: [TestRoutesModule] });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await valkey.stop();
  });

  const post = (url: string, body: unknown, key?: string, remoteAddress = '10.0.0.1') =>
    app.inject({
      method: 'POST',
      url,
      payload: body as Record<string, unknown>,
      remoteAddress,
      headers: key ? { 'idempotency-key': key } : {},
    });

  describe('request IDs', () => {
    it('mints a UUIDv7 and echoes it', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/health/live' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
      expect(isUuidV7(res.headers['x-request-id'])).toBe(true);
    });

    it('keeps a caller-supplied UUID and replaces anything else', async () => {
      const id = uuidv7();
      const kept = await app.inject({
        method: 'GET',
        url: '/v1/health/live',
        headers: { 'x-request-id': id },
      });
      expect(kept.headers['x-request-id']).toBe(id);

      const replaced = await app.inject({
        method: 'GET',
        url: '/v1/health/live',
        headers: { 'x-request-id': 'evil\ninjected log line' },
      });
      expect(isUuidV7(replaced.headers['x-request-id'])).toBe(true);
    });
  });

  describe('problem+json errors', () => {
    it('returns 404 problem+json for unknown routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/does-not-exist' });
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.json()).toMatchObject({
        type: 'https://docs.localhost/errors/NOT_FOUND',
        title: 'Not found',
        status: 404,
        code: 'NOT_FOUND',
        requestId: res.headers['x-request-id'],
      });
    });

    it("maps DomainError('ITEM_UNAVAILABLE') to 409 with its code and detail", async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/__test/domain-error' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        type: 'https://docs.localhost/errors/ITEM_UNAVAILABLE',
        title: 'Item unavailable',
        status: 409,
        code: 'ITEM_UNAVAILABLE',
        detail: 'Fattoush is sold out today',
        requestId: res.headers['x-request-id'],
      });
    });

    it('keeps the catalogue status and code when extensions reuse reserved names', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/__test/session-closed' });
      expect(res.statusCode).toBe(410);
      expect(res.json()).toMatchObject({ status: 410, code: 'SESSION_CLOSED', sessionId: 's1' });
    });

    it('answers router errors (bad encoding, overlong params) as problem+json with a request ID', async () => {
      const badUrl = await app.inject({ method: 'GET', url: '/v1/__test/items/%zz' });
      expect(badUrl.statusCode).toBe(400);
      expect(badUrl.headers['content-type']).toContain('application/problem+json');
      expect(badUrl.json()).toMatchObject({
        code: 'BAD_REQUEST',
        requestId: badUrl.headers['x-request-id'],
      });
      expect(isUuidV7(badUrl.headers['x-request-id'])).toBe(true);

      const longParam = await app.inject({
        method: 'GET',
        url: `/v1/__test/items/${'a'.repeat(150)}`,
      });
      expect(longParam.statusCode).toBe(414);
      expect(longParam.json()).toMatchObject({ code: 'URI_TOO_LONG' });
    });

    it('hides internal details of unexpected errors', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/__test/boom' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({ code: 'INTERNAL', status: 500 });
      expect(res.body).not.toContain('postgres://');
    });

    it('reports zod validation failures field by field', async () => {
      const res = await post('/v1/__test/orders', { item: '', qty: 99 }, uuidv7());
      expect(res.statusCode).toBe(400);
      const body = res.json<{ code: string; errors: { path: string }[] }>();
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.errors.map((error) => error.path).sort()).toEqual(['item', 'qty']);
    });

    it('turns malformed JSON into a 400 problem', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/__test/orders',
        headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
        payload: '{"item":',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'BAD_REQUEST', status: 400 });
    });
  });

  describe('idempotency', () => {
    it('requires a UUID Idempotency-Key on idempotent routes', async () => {
      const missing = await post('/v1/__test/orders', ORDER);
      expect(missing.statusCode).toBe(400);
      expect(missing.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });

      const notUuid = await post('/v1/__test/orders', ORDER, 'retry-1');
      expect(notUuid.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    });

    it('replays the first response for the same key without running the handler again', async () => {
      const key = uuidv7();
      const before = calls.orders;
      const first = await post('/v1/__test/orders', ORDER, key);
      const second = await post('/v1/__test/orders', { qty: 2, item: 'fattoush' }, key);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.json()).toEqual(first.json());
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(calls.orders - before).toBe(1);
    });

    it('rejects the same key with a different body with 422 IDEMPOTENCY_MISMATCH', async () => {
      const key = uuidv7();
      await post('/v1/__test/orders', ORDER, key);
      const res = await post('/v1/__test/orders', { ...ORDER, qty: 3 }, key);
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
    });

    it('answers 409 IDEMPOTENCY_IN_PROGRESS while the first request is still running', async () => {
      const key = uuidv7();
      const before = calls.slow;
      const [a, b] = await Promise.all([
        post('/v1/__test/slow', ORDER, key),
        new Promise((resolve) => setTimeout(resolve, 100)).then(() =>
          post('/v1/__test/slow', ORDER, key),
        ),
      ]);
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(409);
      expect(b.json()).toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
      expect(b.headers['retry-after']).toBe('1');
      expect(calls.slow - before).toBe(1);
    });

    it('replays deterministic 4xx outcomes', async () => {
      const key = uuidv7();
      const before = calls.soldOut;
      const first = await post('/v1/__test/sold-out', ORDER, key);
      const second = await post('/v1/__test/sold-out', ORDER, key);
      expect(first.statusCode).toBe(409);
      expect(second.statusCode).toBe(409);
      expect(second.json()).toMatchObject({ code: 'ITEM_UNAVAILABLE' });
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(calls.soldOut - before).toBe(1);
    });

    it('never stores 5xx outcomes, so a retry runs the handler again', async () => {
      const key = uuidv7();
      const before = calls.flaky;
      await post('/v1/__test/flaky', ORDER, key);
      const retry = await post('/v1/__test/flaky', ORDER, key);
      expect(retry.statusCode).toBe(500);
      expect(retry.headers['idempotent-replayed']).toBeUndefined();
      expect(calls.flaky - before).toBe(2);
    });

    it('replays the headers that belong to the outcome, such as Location', async () => {
      const key = uuidv7();
      const before = calls.created;
      const first = await post('/v1/__test/created', ORDER, key);
      const second = await post('/v1/__test/created', ORDER, key);
      expect(first.headers.location).toMatch(/^\/v1\/orders\//);
      expect(second.headers.location).toBe(first.headers.location);
      expect(calls.created - before).toBe(1);
    });

    it('does not store a 5xx that a handler returns without throwing', async () => {
      const key = uuidv7();
      const before = calls.degraded;
      expect((await post('/v1/__test/degraded', ORDER, key)).statusCode).toBe(503);
      const retry = await post('/v1/__test/degraded', ORDER, key);
      expect(retry.statusCode).toBe(503);
      expect(retry.headers['idempotent-replayed']).toBeUndefined();
      expect(calls.degraded - before).toBe(2);
    });

    it('rejects absurdly nested bodies with 400 instead of crashing', async () => {
      const deep = `${'['.repeat(5_000)}1${']'.repeat(5_000)}`;
      const res = await app.inject({
        method: 'POST',
        url: '/v1/__test/orders',
        headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
        payload: `{"item":${deep},"qty":1}`,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('scopes keys per actor', async () => {
      const key = uuidv7();
      const mine = await post('/v1/__test/orders', ORDER, key, '10.0.0.7');
      const theirs = await post('/v1/__test/orders', ORDER, key, '10.0.0.8');
      expect(theirs.statusCode).toBe(201);
      expect(theirs.headers['idempotent-replayed']).toBeUndefined();
      expect(theirs.json<{ orderId: string }>().orderId).not.toBe(
        mine.json<{ orderId: string }>().orderId,
      );
    });
  });

  describe('rate limiting', () => {
    const hit = (remoteAddress: string) =>
      app.inject({ method: 'GET', url: '/v1/__test/limited', remoteAddress });

    it('allows the limit, then answers 429 RATE_LIMITED with Retry-After', async () => {
      const ok = await Promise.all([hit('10.1.0.1'), hit('10.1.0.1'), hit('10.1.0.1')]);
      expect(ok.map((res) => res.statusCode)).toEqual([200, 200, 200]);

      const limited = await hit('10.1.0.1');
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('tracks callers separately', async () => {
      await Promise.all([hit('10.2.0.1'), hit('10.2.0.1'), hit('10.2.0.1')]);
      expect((await hit('10.2.0.2')).statusCode).toBe(200);
    });

    it('slides: a slot frees up when the oldest request leaves the window', async () => {
      await hit('10.3.0.1');
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await hit('10.3.0.1');
      await hit('10.3.0.1');
      expect((await hit('10.3.0.1')).statusCode).toBe(429);
      // The first hit expires ~2.0 s after it was made; the other two are still in the window.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      expect((await hit('10.3.0.1')).statusCode).toBe(200);
      expect((await hit('10.3.0.1')).statusCode).toBe(429);
    });

    it('ignores X-Forwarded-For, so rotating it does not reset the limit', async () => {
      const spoofed = (i: number) =>
        app.inject({
          method: 'GET',
          url: '/v1/__test/limited',
          remoteAddress: '10.4.0.1',
          headers: { 'x-forwarded-for': `198.51.100.${String(i)}, 203.0.113.77` },
        });
      const statuses = [];
      for (let i = 0; i < 5; i += 1) statuses.push((await spoofed(i)).statusCode);
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
    });

    it('puts every address of one IPv6 /64 in the same bucket', async () => {
      const statuses = [];
      for (let i = 1; i <= 4; i += 1)
        statuses.push((await hit(`2001:db8:1:2::${String(i)}`)).statusCode);
      expect(statuses).toEqual([200, 200, 200, 429]);
      expect((await hit('2001:db8:1:3::1')).statusCode).toBe(200);
    });

    it('shares the default bucket across routes (one per-actor cap, API §8)', async () => {
      for (let i = 0; i < 3; i += 1) {
        await app.inject({ method: 'GET', url: '/v1/__test/ping', remoteAddress: '10.5.0.1' });
      }
      expect((await hit('10.5.0.1')).statusCode).toBe(429);
    });

    it('blocks every request when a limit is 0', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/__test/off',
        remoteAddress: '10.6.0.1',
      });
      expect(res.statusCode).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('never throttles health checks', async () => {
      const results = await Promise.all(
        Array.from({ length: 320 }, () => app.inject({ method: 'GET', url: '/v1/health/live' })),
      );
      expect(results.every((res) => res.statusCode === 200)).toBe(true);
    });
  });

  describe('HTTP hardening', () => {
    it('sets Helmet headers', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/health/live' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('allows credentialed CORS only for trusted origins', async () => {
      const preflight = (origin: string) =>
        app.inject({
          method: 'OPTIONS',
          url: '/v1/__test/orders',
          headers: {
            origin,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'content-type,idempotency-key',
          },
        });
      const trusted = await preflight('http://localhost:3000');
      expect(trusted.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(trusted.headers['access-control-allow-credentials']).toBe('true');

      const untrusted = await preflight('https://evil.example');
      expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('behind Cloudflare (CLIENT_IP_HEADER=cf-connecting-ip)', () => {
    let edgeApp: NestFastifyApplication;
    const EDGE = '172.18.0.5';

    beforeAll(async () => {
      edgeApp = await createApp(
        testEnv({ REDIS_URL: valkey.url, CLIENT_IP_HEADER: 'cf-connecting-ip' }),
        { imports: [TestRoutesModule] },
      );
      await edgeApp.init();
      await edgeApp.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await edgeApp.close();
    });

    const viaEdge = (headers: Record<string, string>) =>
      edgeApp.inject({ method: 'GET', url: '/v1/__test/limited', remoteAddress: EDGE, headers });

    it('keys diners by the Cloudflare client IP, not the shared edge address', async () => {
      for (let i = 0; i < 3; i += 1) await viaEdge({ 'cf-connecting-ip': '198.51.100.50' });
      expect((await viaEdge({ 'cf-connecting-ip': '198.51.100.50' })).statusCode).toBe(429);
      expect((await viaEdge({ 'cf-connecting-ip': '198.51.100.51' })).statusCode).toBe(200);
    });

    it('cannot be steered by a spoofed X-Forwarded-For', async () => {
      const statuses = [];
      for (let i = 0; i < 4; i += 1) {
        const res = await viaEdge({
          'cf-connecting-ip': '198.51.100.60',
          'x-forwarded-for': `6.6.6.${String(i)}, 198.51.100.60`,
        });
        statuses.push(res.statusCode);
      }
      expect(statuses).toEqual([200, 200, 200, 429]);
    });
  });

  describe('idempotency under a short in-flight TTL', () => {
    let shortApp: NestFastifyApplication;

    beforeAll(async () => {
      shortApp = await createApp(testEnv({ REDIS_URL: valkey.url }), {
        imports: [TestRoutesModule],
        idempotency: { inFlightTtlMs: 300 },
      });
      await shortApp.init();
      await shortApp.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await shortApp.close();
    });

    it('keeps the key locked while a request outlives the marker TTL', async () => {
      const key = uuidv7();
      const before = calls.verySlow;
      const send = () =>
        shortApp.inject({
          method: 'POST',
          url: '/v1/__test/very-slow',
          payload: ORDER,
          headers: { 'idempotency-key': key },
          remoteAddress: '10.9.0.1',
        });
      const [first, retry] = await Promise.all([
        send(),
        new Promise((resolve) => setTimeout(resolve, 700)).then(send),
      ]);
      expect(first.statusCode).toBe(201);
      expect(retry.statusCode).toBe(409);
      expect(retry.json()).toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
      expect(calls.verySlow - before).toBe(1);

      const replay = await send();
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.json()).toEqual(first.json());
    });
  });

  describe('IdempotencyStore ownership', () => {
    it('lets only the claiming request refresh, complete or release its key', async () => {
      const redis = new Redis(valkey.url);
      try {
        const store = new IdempotencyStore(redis);
        const key = `idem:test:${uuidv7()}`;
        const claim = await store.claim(key, 'fp');
        if (!claim.claimed) throw new Error('expected to claim a fresh key');

        const record = {
          state: 'completed',
          fingerprint: 'fp',
          status: 201,
          body: { n: 1 },
        } as const;
        expect(await store.refresh(key, 'someone-else')).toBe(false);
        expect(await store.complete(key, 'someone-else', record)).toBe(false);
        expect(await store.release(key, 'someone-else')).toBe(false);

        expect(await store.complete(key, claim.token, record)).toBe(true);
        // Once completed, the old token can no longer touch the stored response.
        expect(await store.release(key, claim.token)).toBe(false);
        const again = await store.claim(key, 'fp');
        expect(again).toMatchObject({
          claimed: false,
          existing: { state: 'completed', body: { n: 1 } },
        });
      } finally {
        redis.disconnect();
      }
    });
  });
});
