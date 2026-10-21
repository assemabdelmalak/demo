import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sentryOptions } from './index.js';

/**
 * A real HTTP request through the Node SDK the API, worker and Next servers use, with the shared
 * options and a transport that records every envelope line. Spans skip beforeSend, so this is
 * where request bodies, client IPs and cookies would leak if data collection were left on.
 */
function initRecording(tracesSampleRate: number): string[] {
  const lines: string[] = [];
  const options = sentryOptions({
    dsn: 'https://public@o0.ingest.sentry.io/1',
    release: 'abc1234',
    environment: 'test',
    tracesSampleRate,
  });
  Sentry.init({
    ...options,
    transport: (transportOptions) =>
      Sentry.createTransport(transportOptions, (request) => {
        const body =
          typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
        lines.push(...body.split('\n'));
        return Promise.resolve({ statusCode: 200 });
      }),
  });
  return lines;
}

const SECRETS = [
  'owner@example.com',
  'hunter2',
  'Rania',
  '203.0.113.7',
  'radd_device',
  'dev123',
  's3cret',
  'dev-abc-123',
];

let server: Server | undefined;

async function postSignIn(extraHeaders: Record<string, string> = {}): Promise<void> {
  server = createServer((request, response) => {
    request.resume();
    request.on('end', () => response.end('{"ok":true}'));
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${String(port)}/v1/auth/sign-in`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7',
      'cf-connecting-ip': '203.0.113.7',
      'x-device-id': 'dev-abc-123',
      cookie: 'radd_device=dev123; better-auth.session_token=s3cret',
      ...extraHeaders,
    },
    body: JSON.stringify({ email: 'owner@example.com', password: 'hunter2', name: 'Rania' }),
  });
  await response.text();
  await Sentry.flush(3_000);
}

afterEach(async () => {
  const running = server;
  if (running) await new Promise((resolve) => running.close(resolve));
  server = undefined;
  await Sentry.close();
});

describe('Node Sentry with the shared options', () => {
  it('traces a request without its body, client IP, cookies or unsafe headers', async () => {
    const lines = initRecording(1);
    await postSignIn();

    const sent = lines.join('\n');
    expect(sent).toContain('"type":"span"');
    for (const secret of SECRETS) expect(sent).not.toContain(secret);
  });

  // A forged trace: sampled flag set and the random number the SDK compares against set to 0.
  const FORGED_TRACE = {
    'sentry-trace': '0123456789abcdef0123456789abcdef-0123456789abcdef-1',
    baggage: 'sentry-trace_id=0123456789abcdef0123456789abcdef,sentry-sample_rand=0',
  };

  it('ignores a client that asks for its own request to be traced', async () => {
    const lines = initRecording(0);
    await postSignIn(FORGED_TRACE);

    expect(lines.join('\n')).not.toContain('"type":"span"');
  });

  it('keeps or drops every root span of a request together', async () => {
    // A Next.js request has several root spans (proxy, render, …); each must not draw on its own.
    const lines = initRecording(0.5);
    server = createServer((request, response) => {
      Sentry.startSpan({ name: 'render', parentSpan: null }, () => undefined);
      Sentry.startSpan({ name: 'proxy', parentSpan: null }, () => undefined);
      request.resume();
      request.on('end', () => response.end('ok'));
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    // The test's own client calls belong to no request; only the server's spans are under test.
    const get = () => fetch(`http://127.0.0.1:${String(port)}/`).then((res) => res.text());
    for (let i = 0; i < 24; i++) await Sentry.suppressTracing(get);
    await Sentry.flush(3_000);

    const segmentsPerTrace = new Map<string, number>();
    for (const line of lines) {
      if (!line.startsWith('{"version":2')) continue;
      const { items } = JSON.parse(line) as { items: { trace_id: string; is_segment: boolean }[] };
      for (const span of items.filter((item) => item.is_segment)) {
        segmentsPerTrace.set(span.trace_id, (segmentsPerTrace.get(span.trace_id) ?? 0) + 1);
      }
    }
    // At 0.5, no trace kept in 24 requests has odds of 1 in 16 million.
    expect(segmentsPerTrace.size).toBeGreaterThan(0);
    expect([...segmentsPerTrace.values()].every((count) => count === 3)).toBe(true);
  });

  it('keeps that decision local at a non-zero rate too', async () => {
    // Our draw says "not this one"; the forged baggage says "always".
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const lines = initRecording(0.5);
    await postSignIn(FORGED_TRACE);

    expect(lines.join('\n')).not.toContain('"type":"span"');
  });
});
