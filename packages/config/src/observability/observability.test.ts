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

  it('scrubs the raw transaction name and the path Next.js reports', () => {
    const event = scrubEvent({
      transaction: 'GET /v1/public/receipts/receipt-secret',
      contexts: {
        nextjs: {
          request_path: '/receipts/receipt-secret?q=nut+free+for+Rania',
          router_kind: 'App Router',
        },
      },
    });
    expect(event.transaction).toBe('GET /v1/public/receipts/[redacted]');
    expect(event.contexts.nextjs).toEqual({
      request_path: '/receipts/[redacted]',
      router_kind: 'App Router',
    });
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

  it('drops the query and fragment SDK 11 keeps beside the URL', () => {
    expect(
      scrubBreadcrumb({
        category: 'http',
        data: {
          url: 'https://s3.radd.test/radd-private/a.jpg',
          'url.query': 'X-Amz-Signature=sig-secret&q=nut+free+for+Rania',
          'url.fragment': 'frag-secret',
          'http.query': 'q=Rania',
          method: 'PUT',
        },
      }),
    ).toEqual({
      category: 'http',
      data: { url: 'https://s3.radd.test/radd-private/a.jpg', method: 'PUT' },
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

describe('scrubSpan: people and free text', () => {
  it('drops bodies, client addresses, users and headers outside the allowlist', () => {
    const span = scrubSpan({
      name: 'POST /v1/auth/sign-in',
      attributes: {
        'http.request.body.data': '{"email":"owner@example.com","password":"hunter2"}',
        'http.response.body.size': 12,
        'client.address': '203.0.113.7',
        'network.peer.address': '203.0.113.7',
        'user.ip_address': '203.0.113.7',
        'user.id': 'participant-1',
        'http.request.header.cookie': ['radd_device=dev123'],
        'http.request.header.x-forwarded-for': '203.0.113.7',
        'http.request.header.authorization': 'Bearer t0ken',
        'http.request.header.user-agent': 'Mozilla/5.0',
        'http.request.header.x-request-id': '0199f2a4-5b6c-7d8e-9f01-23456789abcd',
        'http.response.header.set-cookie': 'radd_session=s3cret',
        'http.response.status_code': 200,
      },
    });
    expect(span.attributes).toEqual({
      'http.request.header.user-agent': 'Mozilla/5.0',
      'http.request.header.x-request-id': '0199f2a4-5b6c-7d8e-9f01-23456789abcd',
      'http.response.status_code': 200,
    });
  });

  it('keeps AI model and usage metadata but never prompts, outputs or tool arguments', () => {
    const span = scrubSpan({
      name: 'chat claude',
      attributes: {
        'gen_ai.request.model': 'claude-haiku',
        'gen_ai.usage.input_tokens': 120,
        'gen_ai.operation.name': 'chat',
        'gen_ai.input.messages': '[{"role":"user","content":"is the fattoush nut-free?"}]',
        'gen_ai.output.messages': '[...]',
        'gen_ai.request.messages': '[...]',
        'gen_ai.response.text': 'It contains...',
        'gen_ai.system_instructions': 'You are...',
        'gen_ai.tool.call.arguments': '{"dish":"fattoush"}',
      },
    });
    expect(span.attributes).toEqual({
      'gen_ai.request.model': 'claude-haiku',
      'gen_ai.usage.input_tokens': 120,
      'gen_ai.operation.name': 'chat',
    });
  });

  it('reduces Redis statements to the command, keeping no arguments', () => {
    const span = scrubSpan({
      name: 'eval return ARGV[1] 1 radd:idem:k {"message":"my name is Rania"}',
      attributes: {
        'db.system.name': { value: 'redis', type: 'string' },
        'db.query.text': {
          value: 'eval return ARGV[1] 1 radd:idem:k {"message":"my name is Rania"}',
          type: 'string',
        },
        'db.statement': 'evalsha abc 1 radd:job {"name":"Rania"}',
      },
    });
    expect(JSON.stringify(span)).not.toContain('Rania');
    expect(span).toEqual({
      name: 'eval',
      attributes: {
        'db.system.name': { value: 'redis', type: 'string' },
        'db.query.text': { value: 'eval', type: 'string' },
        'db.statement': 'evalsha',
      },
    });
  });

  it('keeps parameterised SQL but drops bound parameters', () => {
    const span = scrubSpan({
      name: 'SELECT radd',
      attributes: {
        'db.system.name': 'postgresql',
        'db.query.text': 'select * from menu_items where id = $1',
        'db.query.parameter.0': 'Rania',
      },
    });
    expect(span.attributes).toEqual({
      'db.system.name': 'postgresql',
      'db.query.text': 'select * from menu_items where id = $1',
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
  const base = { dsn: undefined, release: 'abc', environment: 'local' };

  it('is disabled without a DSN and switches off every kind of personal-data collection', () => {
    expect(sentryOptions(base)).toMatchObject({ enabled: false });
    const options = sentryOptions({
      dsn: 'https://k@o1.ingest.sentry.io/1',
      release: 'abc',
      environment: 'staging',
    });
    expect(options).toMatchObject({ enabled: true, release: 'abc', environment: 'staging' });
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: {
          allow: ['user-agent', 'content-type', 'content-length', 'origin', 'x-request-id'],
        },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
  });

  it('propagates traces to no third party unless a target is listed', () => {
    expect(sentryOptions(base).tracePropagationTargets).toEqual([]);
    expect(
      sentryOptions({ ...base, tracePropagationTargets: ['http://localhost:4000'] })
        .tracePropagationTargets,
    ).toEqual(['http://localhost:4000']);
  });

  it('samples at the configured rate whatever an incoming trace asks for', () => {
    expect(sentryOptions(base).tracesSampler()).toBe(0);
    expect(sentryOptions({ ...base, tracesSampleRate: 0.2 }).tracesSampler()).toBe(0.2);
  });
});
