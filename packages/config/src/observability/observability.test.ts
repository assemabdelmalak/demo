import { describe, expect, it } from 'vitest';

import {
  scrubBreadcrumb,
  scrubEvent,
  scrubSpan,
  sentryOptions,
  traceContextScrubbing,
} from './index.js';

describe('scrubEvent', () => {
  it('removes cookies, bodies, query strings, users and unsafe headers', () => {
    const event = scrubEvent({
      request: {
        url: 'https://api.radd.test/v1/public/receipts/receipt-secret?token=query-secret',
        headers: {
          Cookie: 'rm_dev=cookie-secret',
          authorization: 'Bearer auth-secret',
          'cf-connecting-ip': '198.51.100.7',
          'user-agent': 'Mozilla/5.0',
          'x-request-id': '0192f6f0-0000-7000-8000-000000000001',
        },
        cookies: { rm_dev: 'cookie-secret' },
        query_string: 'token=query-secret',
        data: { message: 'I am allergic to nuts, my name is Nour' },
      },
      user: { ip_address: '198.51.100.7' },
    });
    const text = JSON.stringify(event);
    for (const secret of [
      'cookie-secret',
      'auth-secret',
      'query-secret',
      'receipt-secret',
      '198.51.100.7',
      'Nour',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(event.request.headers).toEqual({
      'user-agent': 'Mozilla/5.0',
      'x-request-id': '0192f6f0-0000-7000-8000-000000000001',
    });
    expect(event.request.url).toBe('https://api.radd.test/v1/public/receipts/[redacted]');
  });

  it('scrubs breadcrumbs already on the event', () => {
    const event = scrubEvent({
      breadcrumbs: [
        { category: 'console', data: { arguments: ['chat: is the fattoush nut-free?'] } },
        { category: 'http', data: { url: 'https://api.radd.test/v1/x?token=query-secret' } },
      ],
    });
    expect(event.breadcrumbs).toEqual([
      { category: 'http', data: { url: 'https://api.radd.test/v1/x' } },
    ]);
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs and strips query strings from HTTP ones', () => {
    expect(scrubBreadcrumb({ category: 'console', data: { arguments: ['chat text'] } })).toBeNull();
    expect(scrubBreadcrumb({ category: 'fetch', data: { url: '/v1/x?token=secret' } })).toEqual({
      category: 'fetch',
      data: { url: '/v1/x' },
    });
  });

  it('strips navigation breadcrumbs the same way', () => {
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/receipts/receipt-secret', to: '/t/abc?lang=ar' },
      }),
    ).toEqual({ category: 'navigation', data: { from: '/receipts/[redacted]', to: '/t/abc' } });
  });
});

describe('scrubSpan', () => {
  it('strips queries and secret segments from names and URL attributes', () => {
    const span = scrubSpan({
      name: 'GET /v1/public/receipts/receipt-secret?token=query-secret',
      attributes: {
        'url.full': 'https://api.radd.test/v1/public/receipts/receipt-secret?token=query-secret',
        'http.url': { value: 'https://s3.test/radd-private/a.jpg?X-Amz-Signature=sig-secret' },
        'url.query': 'token=query-secret',
        'sentry.segment.name': 'GET /v1/public/receipts/receipt-secret',
        'http.request.method': 'GET',
      },
    });
    expect(JSON.stringify(span)).not.toMatch(/receipt-secret|query-secret|sig-secret/);
    expect(span).toEqual({
      name: 'GET /v1/public/receipts/[redacted]',
      attributes: {
        'url.full': 'https://api.radd.test/v1/public/receipts/[redacted]',
        'http.url': { value: 'https://s3.test/radd-private/a.jpg' },
        'sentry.segment.name': 'GET /v1/public/receipts/[redacted]',
        'http.request.method': 'GET',
      },
    });
  });
});

describe('traceContextScrubbing', () => {
  it('scrubs the root span name carried in the trace context', () => {
    let hook: ((context: { transaction?: string }) => void) | undefined;
    traceContextScrubbing().setup({
      on: (_name, callback) => {
        hook = callback;
      },
    });
    const context = { transaction: 'GET /v1/public/receipts/receipt-secret?token=query-secret' };
    hook?.(context);
    expect(context.transaction).toBe('GET /v1/public/receipts/[redacted]');
  });
});

describe('sentryOptions', () => {
  it('is disabled without a DSN and never sends default PII', () => {
    expect(sentryOptions({ dsn: undefined, release: 'abc', environment: 'local' })).toMatchObject({
      enabled: false,
      sendDefaultPii: false,
    });
    expect(
      sentryOptions({
        dsn: 'https://k@o1.ingest.sentry.io/1',
        release: 'abc',
        environment: 'staging',
      }),
    ).toMatchObject({
      enabled: true,
      release: 'abc',
      environment: 'staging',
      tracesSampleRate: 0,
    });
  });

  it('propagates traces to no third party unless a target is listed', () => {
    const base = { dsn: undefined, release: 'abc', environment: 'local' };
    expect(sentryOptions(base).tracePropagationTargets).toEqual([]);
    expect(
      sentryOptions({ ...base, tracePropagationTargets: ['http://localhost:4000'] })
        .tracePropagationTargets,
    ).toEqual(['http://localhost:4000']);
  });

  it('passes the server trace sample rate through', () => {
    expect(
      sentryOptions({ dsn: undefined, release: 'abc', environment: 'local', tracesSampleRate: 0.2 })
        .tracesSampleRate,
    ).toBe(0.2);
  });
});
