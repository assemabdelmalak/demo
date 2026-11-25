import { describe, expect, it } from 'vitest';

import { auditIpHash, REDACTED, sanitizeAuditState } from './audit-state';
import { actorOf } from './audit.service';
import { type RequestContextState } from '../authz/request-context';

describe('auditIpHash', () => {
  it('is stable for one secret, differs between secrets and never contains the address', () => {
    const ip = '203.0.113.7';
    const hash = auditIpHash('secret-one', ip);
    expect(auditIpHash('secret-one', ip)).toBe(hash);
    expect(auditIpHash('secret-two', ip)).not.toBe(hash);
    expect(auditIpHash('secret-one', '203.0.113.8')).not.toBe(hash);
    expect(hash).not.toContain(ip);
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('sanitizeAuditState', () => {
  it('keeps ordinary fields and turns dates into ISO strings', () => {
    const at = new Date('2026-11-25T10:00:00.000Z');
    expect(
      sanitizeAuditState({ name: 'Bar tablet', revokedAt: at, endedSessions: 2 }, null),
    ).toEqual({ name: 'Bar tablet', revokedAt: '2026-11-25T10:00:00.000Z', endedSessions: 2 });
  });

  it('redacts credentials, codes, payment references and addresses at any depth', () => {
    const state = {
      pin: '4821',
      pin_hash: '$argon2id$…',
      TokenHash: 'abc',
      otp: '123456',
      clientSecret: 'shh',
      payment: { externalReference: 'WHISH-998877', amountMinor: 1500 },
      attempts: [{ ipAddress: '198.51.100.4' }, { reference: 'OMT-1' }],
      status: 'active',
    };
    expect(sanitizeAuditState(state, null)).toEqual({
      pin: REDACTED,
      pin_hash: REDACTED,
      TokenHash: REDACTED,
      otp: REDACTED,
      clientSecret: REDACTED,
      payment: { externalReference: REDACTED, amountMinor: 1500 },
      attempts: [{ ipAddress: REDACTED }, { reference: REDACTED }],
      status: 'active',
    });
  });

  it("replaces the request's client IP wherever it appears as a value", () => {
    expect(
      sanitizeAuditState({ note: '203.0.113.7', seen: ['203.0.113.7', 'ok'] }, '203.0.113.7'),
    ).toEqual({ note: REDACTED, seen: [REDACTED, 'ok'] });
  });

  it('stores nothing for a missing state', () => {
    expect(sanitizeAuditState(undefined, null)).toBeNull();
    expect(sanitizeAuditState(null, '203.0.113.7')).toBeNull();
  });
});

describe('actorOf', () => {
  const base: RequestContextState = { requestId: 'r1', clientIp: '203.0.113.7' };
  const session = {
    sessionId: 's1',
    userId: 'u-session',
    email: 'a@radd.test',
    emailVerified: true,
    activeOrganizationId: null,
    pinSession: false,
    staffDeviceId: null,
    twoFactorVerifiedAt: null,
    twoFactorEnabled: false,
    createdAt: new Date(),
  };

  it('names the super admin, then the member, then the signed-in user, else the system', () => {
    expect(
      actorOf({ ...base, session, superAdmin: { kind: 'super_admin', userId: 'u-admin' } }),
    ).toEqual({ type: 'super_admin', id: 'u-admin' });
    expect(
      actorOf({
        ...base,
        session,
        actor: {
          kind: 'member',
          userId: 'u-member',
          organizationId: 'o1',
          role: 'manager',
          pinSession: false,
        },
      }),
    ).toEqual({ type: 'user', id: 'u-member' });
    expect(actorOf({ ...base, session })).toEqual({ type: 'user', id: 'u-session' });
    expect(actorOf(base)).toEqual({ type: 'system', id: null });
    expect(actorOf(undefined)).toEqual({ type: 'system', id: null });
  });
});
