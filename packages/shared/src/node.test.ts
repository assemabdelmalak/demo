import { createServer, type IncomingHttpHeaders } from 'node:http';
import { type AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { isUuidV7 } from './ids.js';
import { assignRequestIds } from './node.js';

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
