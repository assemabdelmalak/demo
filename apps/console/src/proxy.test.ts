import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { isUuidV7 } from '@radd/shared';

import { proxy } from './proxy';

const forwarded = (response: Response) => response.headers.get('x-middleware-request-x-request-id');

describe('proxy request IDs', () => {
  it('mints an ID and puts it on both the forwarded request and the response', () => {
    const response = proxy(new NextRequest('http://localhost/'));
    const id = response.headers.get('x-request-id');
    expect(isUuidV7(id)).toBe(true);
    expect(forwarded(response)).toBe(id);
  });

  it('keeps a valid incoming ID', () => {
    const id = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';
    const response = proxy(
      new NextRequest('http://localhost/', { headers: { 'x-request-id': id } }),
    );
    expect(response.headers.get('x-request-id')).toBe(id);
    expect(forwarded(response)).toBe(id);
  });

  it('replaces an invalid incoming ID', () => {
    const response = proxy(
      new NextRequest('http://localhost/', { headers: { 'x-request-id': 'forged-id' } }),
    );
    expect(isUuidV7(response.headers.get('x-request-id'))).toBe(true);
  });
});
