import { headers } from 'next/headers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authCookieHeader, serverApiClient } from './api.server';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@radd/config/env', () => ({ loadEnv: () => ({ API_PUBLIC_URL: 'http://api.test' }) }));

const ID = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';

async function sentHeaders(incoming: HeadersInit): Promise<Headers> {
  vi.mocked(headers).mockResolvedValue(new Headers(incoming));
  const fetch = vi.fn((_request: Request) => Promise.resolve(Response.json({ status: 'ok' })));
  vi.stubGlobal('fetch', fetch);
  await (await serverApiClient()).GET('/v1/health/live');
  const request = fetch.mock.calls[0]?.[0];
  if (!request) throw new Error('no request was sent');
  expect(request.url).toBe('http://api.test/v1/health/live');
  return request.headers;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('serverApiClient', () => {
  it('forwards the page request ID to the API', async () => {
    expect((await sentHeaders({ 'x-request-id': ID })).get('x-request-id')).toBe(ID);
  });

  it('sends no request ID header when the page has none', async () => {
    expect((await sentHeaders({})).has('x-request-id')).toBe(false);
  });
});

describe('session cookie forwarding', () => {
  it('forwards only Better Auth cookies, in every environment spelling', async () => {
    const sent = await sentHeaders({
      cookie:
        'NEXT_LOCALE=ar; radd_console_theme=dark; radd-local.session_token=abc.def; __Secure-radd.session_token=x; radd-staging.two_factor=y; other=z',
    });
    expect(sent.get('cookie')).toBe(
      'radd-local.session_token=abc.def; __Secure-radd.session_token=x; radd-staging.two_factor=y',
    );
  });

  it('sends no cookie header when the page has no session cookie', async () => {
    expect((await sentHeaders({ cookie: 'NEXT_LOCALE=en' })).has('cookie')).toBe(false);
    expect((await sentHeaders({})).has('cookie')).toBe(false);
  });

  it('ignores look-alike names', () => {
    expect(authCookieHeader('raddx.session_token=1; radd-.x=2; xradd.session_token=3')).toBeNull();
    expect(authCookieHeader('radd.session_token=1')).toBe('radd.session_token=1');
    expect(authCookieHeader(null)).toBeNull();
  });
});
