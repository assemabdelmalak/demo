import { describe, expect, it } from 'vitest';

import { ADDRESS_CODE_LIMIT, requestAddress, SIGN_IN_LOCKOUT } from './address-limits';

describe('requestAddress', () => {
  it('reads the address the way Better Auth compares it, trimmed', () => {
    expect(requestAddress({ email: '  Rana@Example.TEST ' })).toBe('rana@example.test');
    expect(requestAddress({ email: 'a@b.test', password: 'x' })).toBe('a@b.test');
  });

  it('finds none in bodies that do not name one', () => {
    for (const body of [
      undefined,
      null,
      'a@b.test',
      [],
      {},
      { email: '' },
      { email: '   ' },
      { email: 3 },
    ]) {
      expect(requestAddress(body)).toBeUndefined();
    }
  });
});

describe('the limits (ADR-034)', () => {
  it('are the ones the owner approved', () => {
    expect(ADDRESS_CODE_LIMIT).toEqual({ window: 3600, max: 5 });
    expect(SIGN_IN_LOCKOUT).toEqual({ failures: 10, windowMs: 900_000, lockMs: 900_000 });
  });
});
