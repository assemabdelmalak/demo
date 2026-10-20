import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client.js';
import { createDinerSocket, createStaffSocket } from './events.js';

describe('createApiClient', () => {
  it('calls typed paths against the base URL with credentials included', async () => {
    const fetchMock = vi.fn((request: Request) => {
      expect(request.url).toBe('http://api.test/v1/health/live');
      expect(request.credentials).toBe('include');
      expect(request.headers.get('x-request-id')).toBe('rid-1');
      return Promise.resolve(Response.json({ status: 'ok' }));
    });
    const client = createApiClient({
      baseUrl: 'http://api.test',
      headers: { 'x-request-id': 'rid-1' },
      fetch: fetchMock,
    });
    const { data } = await client.GET('/v1/health/live');
    expect(data).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('socket factories', () => {
  it('target the right namespace and stay disconnected until asked', () => {
    const diner = createDinerSocket('http://api.test');
    const staff = createStaffSocket('http://api.test');
    expect(diner.connected).toBe(false);
    expect((diner.io as unknown as { uri: string }).uri).toBe('http://api.test/diner');
    // `nsp` is private in the typings; it is what socket.io-client connects to.
    expect((diner as unknown as { nsp: string }).nsp).toBe('/diner');
    expect((staff as unknown as { nsp: string }).nsp).toBe('/staff');
    diner.close();
    staff.close();
  });
});
