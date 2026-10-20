import { describe, expect, it } from 'vitest';

import { isUuid, isUuidV7, uuidv7 } from './ids.js';

describe('uuidv7', () => {
  it('generates valid, time-ordered v7 UUIDs', () => {
    const ids = Array.from({ length: 50 }, () => uuidv7());
    for (const id of ids) expect(isUuidV7(id)).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('isUuid', () => {
  it('rejects anything that is not a UUID', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });
});
