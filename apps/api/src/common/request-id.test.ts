import { type IncomingMessage } from 'node:http';

import { describe, expect, it } from 'vitest';

import { isUuidV7, uuidv7 } from '@radd/shared';

import { genRequestId } from './request-id';

const req = (value?: string) =>
  ({ headers: value === undefined ? {} : { 'x-request-id': value } }) as IncomingMessage;

describe('genRequestId', () => {
  it('keeps a valid incoming UUID', () => {
    const id = uuidv7();
    expect(genRequestId(req(id))).toBe(id);
  });

  it('mints a UUIDv7 when the header is missing or not a UUID, and writes it back', () => {
    for (const incoming of [undefined, '', 'abc', 'x'.repeat(5000)]) {
      const message = req(incoming);
      const id = genRequestId(message);
      expect(isUuidV7(id)).toBe(true);
      expect(message.headers['x-request-id']).toBe(id);
    }
  });
});
