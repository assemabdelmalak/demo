import { describe, expect, it } from 'vitest';

import { bullBoardRefusal } from './bull-board';
import { type AuthSession } from '../auth/auth-session';

const NOW = new Date('2026-11-23T12:00:00.000Z');
const API = 'https://api.radd.test';
const ALLOWLIST = ['admin@radd.test'];

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    sessionId: '0199f2a4-5b6c-7d8e-9f01-000000000001',
    userId: '0199f2a4-5b6c-7d8e-9f01-000000000002',
    email: 'admin@radd.test',
    emailVerified: true,
    activeOrganizationId: null,
    pinSession: false,
    staffDeviceId: null,
    twoFactorVerifiedAt: new Date(NOW.getTime() - 60_000),
    twoFactorEnabled: true,
    createdAt: NOW,
    ...overrides,
  };
}

const refusal = (authSession: AuthSession | undefined, method = 'GET', origin?: string) =>
  bullBoardRefusal(
    { authSession, method, headers: origin === undefined ? {} : { origin } },
    ALLOWLIST,
    API,
    NOW,
  )?.code ?? null;

describe('bullBoardRefusal', () => {
  it('lets a super admin with a recent TOTP check read the board', () => {
    expect(refusal(session())).toBeNull();
  });

  it('refuses the signed-out, non-admins and PIN sessions like any other route', () => {
    expect(refusal(undefined)).toBe('UNAUTHENTICATED');
    expect(refusal(session({ email: 'owner@radd.test' }))).toBe('FORBIDDEN');
    expect(refusal(session({ twoFactorEnabled: false }))).toBe('FORBIDDEN');
    expect(refusal(session({ pinSession: true }))).toBe('FORBIDDEN');
  });

  it('asks for a fresh TOTP check after 12 hours', () => {
    expect(refusal(session({ twoFactorVerifiedAt: null }))).toBe('TWO_FACTOR_REQUIRED');
    expect(
      refusal(session({ twoFactorVerifiedAt: new Date(NOW.getTime() - 13 * 60 * 60 * 1000) })),
    ).toBe('TWO_FACTOR_REQUIRED');
  });

  it('accepts changes only from the API origin, where the board itself is served', () => {
    expect(refusal(session(), 'PUT', API)).toBeNull();
    expect(refusal(session(), 'PUT', 'https://app.radd.test')).toBe('FORBIDDEN');
    expect(refusal(session(), 'DELETE')).toBe('FORBIDDEN');
    expect(refusal(session(), 'POST', 'null')).toBe('FORBIDDEN');
  });
});
