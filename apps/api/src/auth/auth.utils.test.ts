import { describe, expect, it } from 'vitest';

import { uuidv7 } from '@radd/shared';

import {
  authUrlParts,
  cookiePrefixFor,
  crossSubDomainCookieDomain,
  findMalformedId,
  invitationUrl,
  parseLocaleHeader,
  toAuthClientIp,
} from './auth.utils';

describe('parseLocaleHeader', () => {
  it('accepts the UI locales, case- and space-insensitively', () => {
    expect(parseLocaleHeader('ar')).toBe('ar');
    expect(parseLocaleHeader(' AR ')).toBe('ar');
    expect(parseLocaleHeader('en')).toBe('en');
  });

  it('falls back to English for anything else', () => {
    expect(parseLocaleHeader(undefined)).toBe('en');
    expect(parseLocaleHeader(null)).toBe('en');
    expect(parseLocaleHeader('')).toBe('en');
    expect(parseLocaleHeader('fr')).toBe('en');
    expect(parseLocaleHeader('ar-LB')).toBe('en');
  });
});

describe('cookiePrefixFor', () => {
  it('differs per environment so staging never accepts a production cookie', () => {
    expect(cookiePrefixFor('production')).toBe('radd');
    expect(cookiePrefixFor('staging')).toBe('radd-staging');
    expect(cookiePrefixFor('local')).toBe('radd-local');
    expect(cookiePrefixFor('test')).toBe('radd-test');
  });
});

describe('authUrlParts', () => {
  it('splits BETTER_AUTH_URL into origin and base path', () => {
    expect(authUrlParts('http://localhost:4000/v1/auth')).toEqual({
      origin: 'http://localhost:4000',
      basePath: '/v1/auth',
    });
    expect(authUrlParts('https://api.radd.test/v1/auth/')).toEqual({
      origin: 'https://api.radd.test',
      basePath: '/v1/auth',
    });
  });
});

describe('crossSubDomainCookieDomain', () => {
  it('is off for localhost and on for a real domain', () => {
    expect(crossSubDomainCookieDomain('localhost')).toBeUndefined();
    expect(crossSubDomainCookieDomain('')).toBeUndefined();
    expect(crossSubDomainCookieDomain('Radd.Test')).toBe('radd.test');
  });
});

describe('toAuthClientIp', () => {
  it('keeps IPv4 and bare IPv6 and drops a network suffix', () => {
    expect(toAuthClientIp('10.0.0.1')).toBe('10.0.0.1');
    expect(toAuthClientIp('::1')).toBe('::1');
    expect(toAuthClientIp('2001:db8:1:2::/64')).toBe('2001:db8:1:2::');
    expect(toAuthClientIp(undefined)).toBeUndefined();
  });
});

describe('findMalformedId', () => {
  it('accepts UUIDs, nulls and non-ID keys', () => {
    expect(
      findMalformedId({ organizationId: uuidv7(), id: uuidv7(), email: 'x', name: 'not-an-id' }),
    ).toBeUndefined();
    expect(findMalformedId({ organizationId: null })).toBeUndefined();
    expect(findMalformedId(undefined)).toBeUndefined();
    expect(findMalformedId('string body')).toBeUndefined();
  });

  it('names the first malformed ID key, also nested', () => {
    expect(findMalformedId({ organizationId: '1' })).toBe('organizationId');
    expect(findMalformedId({ id: "'; drop table user; --" })).toBe('id');
    expect(findMalformedId({ data: { memberId: 'abc' } })).toBe('memberId');
    expect(findMalformedId({ list: [{ invitationId: 'x' }] })).toBe('invitationId');
  });

  it('ignores provider IDs that are never UUIDs', () => {
    expect(findMalformedId({ providerId: 'credential', accountId: 'github-123' })).toBeUndefined();
  });

  it('only checks keys that look like IDs', () => {
    expect(findMalformedId({ identifier: 'x', idToken: 'y', valid: 'z' })).toBeUndefined();
  });
});

describe('invitationUrl', () => {
  it('points at the console accept page with or without a trailing slash', () => {
    const id = uuidv7();
    expect(invitationUrl('http://localhost:3001', id)).toBe(
      `http://localhost:3001/accept-invitation/${id}`,
    );
    expect(invitationUrl('https://app.raddmenu.com/', id)).toBe(
      `https://app.raddmenu.com/accept-invitation/${id}`,
    );
  });
});
