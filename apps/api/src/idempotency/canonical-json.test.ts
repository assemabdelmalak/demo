import { describe, expect, it } from 'vitest';

import { canonicalJson, JsonTooDeepError, MAX_JSON_DEPTH } from './canonical-json';

describe('canonicalJson', () => {
  it('ignores key order at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
  });

  it('keeps array order and distinguishes values', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ qty: 2 })).not.toBe(canonicalJson({ qty: '2' }));
  });

  it('serialises a missing body as null', () => {
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson(null)).toBe('null');
  });
});

describe('canonicalJson depth limit', () => {
  it('rejects nesting beyond MAX_JSON_DEPTH instead of overflowing the stack', () => {
    let value: unknown = 1;
    for (let i = 0; i < MAX_JSON_DEPTH + 5; i += 1) value = [value];
    expect(() => canonicalJson(value)).toThrow(JsonTooDeepError);
  });
});
