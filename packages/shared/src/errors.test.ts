import { describe, expect, it } from 'vitest';

import { codeForStatus, DomainError, ERROR_CATALOGUE, isErrorCode } from './errors.js';

describe('ERROR_CATALOGUE', () => {
  it('uses SCREAMING_SNAKE_CASE codes with 4xx/5xx statuses', () => {
    for (const [code, { status }] of Object.entries(ERROR_CATALOGUE)) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it('maps the codes named in the specs to their documented statuses', () => {
    expect(ERROR_CATALOGUE.ITEM_UNAVAILABLE.status).toBe(409);
    expect(ERROR_CATALOGUE.IDEMPOTENCY_MISMATCH.status).toBe(422);
    expect(ERROR_CATALOGUE.TABLE_NOT_FOUND.status).toBe(404);
    expect(ERROR_CATALOGUE.TABLE_INACTIVE.status).toBe(410);
    expect(ERROR_CATALOGUE.SESSION_CLOSED.status).toBe(410);
    expect(ERROR_CATALOGUE.PRICE_CHANGED.status).toBe(409);
  });
});

describe('DomainError', () => {
  it('takes its status from the catalogue', () => {
    const error = new DomainError('ITEM_UNAVAILABLE', { detail: 'Fattoush is sold out' });
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(409);
    expect(error.code).toBe('ITEM_UNAVAILABLE');
    expect(error.message).toBe('Fattoush is sold out');
  });

  it('falls back to the catalogue title as message', () => {
    expect(new DomainError('PRICE_CHANGED').message).toBe('Prices changed');
  });
});

describe('isErrorCode', () => {
  it('accepts catalogue codes only', () => {
    expect(isErrorCode('ITEM_UNAVAILABLE')).toBe(true);
    expect(isErrorCode('toString')).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });
});

describe('codeForStatus', () => {
  it.each([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [405, 'METHOD_NOT_ALLOWED'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [429, 'RATE_LIMITED'],
    [418, 'BAD_REQUEST'],
    [502, 'INTERNAL'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('maps %i to %s', (status, code) => {
    expect(codeForStatus(status)).toBe(code);
  });
});
