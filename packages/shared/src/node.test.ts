import { createServer, type IncomingHttpHeaders } from 'node:http';
import { type AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { isUuidV7, uuidv7 } from './ids.js';
import { assignRequestIds, requestIdSampler } from './node.js';

/** The request ID a handler sees, i.e. what any code reading the headers later sees. */
async function seenRequestId(
  headers: Record<string, string>,
): Promise<IncomingHttpHeaders[string]> {
  let seen: IncomingHttpHeaders[string];
  const server = createServer((request, response) => {
    seen = request.headers['x-request-id'];
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await (await fetch(`http://127.0.0.1:${String(port)}/`, { headers })).text();
  await new Promise((resolve) => server.close(resolve));
  return seen;
}

describe('assignRequestIds', () => {
  assignRequestIds();
  assignRequestIds();

  it('gives a request without an ID a fresh UUIDv7 before any handler runs', async () => {
    expect(isUuidV7(await seenRequestId({}))).toBe(true);
  });

  it('keeps a valid incoming ID and replaces an invalid one', async () => {
    const id = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';
    expect(await seenRequestId({ 'x-request-id': id })).toBe(id);
    expect(isUuidV7(await seenRequestId({ 'x-request-id': 'forged<id>' }))).toBe(true);
  });
});

describe('requestIdSampler', () => {
  const ids = Array.from({ length: 20_000 }, () => uuidv7());

  it('gives every service with the same secret the same answer for a request ID', () => {
    const nextServer = requestIdSampler('shared-secret', 0.3);
    const api = requestIdSampler('shared-secret', 0.3);
    expect(ids.every((id) => nextServer(id) === api(id))).toBe(true);
  });

  it('keeps about the configured share of requests, and none or all at the bounds', () => {
    const kept = ids.filter(requestIdSampler('shared-secret', 0.1)).length / ids.length;
    expect(kept).toBeGreaterThan(0.09);
    expect(kept).toBeLessThan(0.11);
    expect(ids.some(requestIdSampler('shared-secret', 0))).toBe(false);
    expect(ids.every(requestIdSampler('shared-secret', 1))).toBe(true);
  });

  it('cannot be predicted without the secret', () => {
    const ours = requestIdSampler('shared-secret', 0.5);
    const guess = requestIdSampler('attacker-guess', 0.5);
    const agree = ids.filter((id) => ours(id) === guess(id)).length / ids.length;
    expect(agree).toBeGreaterThan(0.45);
    expect(agree).toBeLessThan(0.55);
  });
});
