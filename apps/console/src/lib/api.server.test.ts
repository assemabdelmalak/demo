import { headers } from 'next/headers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { serverApiClient } from './api.server';

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
