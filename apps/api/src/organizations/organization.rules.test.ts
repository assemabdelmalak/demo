import { describe, expect, it } from 'vitest';

import { DomainError, MEMBER_ROLES } from '@radd/shared';

import {
  assertAccountSession,
  assertCanCreateOrganization,
  assertCanInvite,
  assertCanUpdateOrganization,
  assertIsMember,
  assertOrganizationWritable,
  canInvite,
  MAX_OWNED_ORGANIZATIONS,
} from './organization.rules';

const actor = { emailVerified: true, pinSession: false };

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe('organisation rules', () => {
  it('lets a verified account create up to the limit', () => {
    expect(
      codeOf(() => {
        assertCanCreateOrganization(actor, 0);
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        assertCanCreateOrganization(actor, MAX_OWNED_ORGANIZATIONS - 1);
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        assertCanCreateOrganization(actor, MAX_OWNED_ORGANIZATIONS);
      }),
    ).toBe('ORG_LIMIT_REACHED');
    expect(
      codeOf(() => {
        assertCanCreateOrganization({ ...actor, emailVerified: false }, 0);
      }),
    ).toBe('EMAIL_NOT_VERIFIED');
    expect(
      codeOf(() => {
        assertCanCreateOrganization({ ...actor, pinSession: true }, 0);
      }),
    ).toBe('FORBIDDEN');
  });

  it('refuses account actions from a PIN session', () => {
    expect(
      codeOf(() => {
        assertAccountSession(actor);
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        assertAccountSession({ ...actor, pinSession: true });
      }),
    ).toBe('FORBIDDEN');
  });

  it('lets any member read and only members', () => {
    for (const role of MEMBER_ROLES)
      expect(
        codeOf(() => {
          assertIsMember(role);
        }),
      ).toBeUndefined();
    expect(
      codeOf(() => {
        assertIsMember(undefined);
      }),
    ).toBe('NOT_A_MEMBER');
  });

  it('lets owners and managers rename the organisation', () => {
    expect(
      codeOf(() => {
        assertCanUpdateOrganization('owner');
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        assertCanUpdateOrganization('manager');
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        assertCanUpdateOrganization('staff');
      }),
    ).toBe('FORBIDDEN');
    expect(
      codeOf(() => {
        assertCanUpdateOrganization('kitchen');
      }),
    ).toBe('FORBIDDEN');
  });

  it.each([
    ['owner', 'manager', true],
    ['owner', 'staff', true],
    ['owner', 'kitchen', true],
    ['owner', 'owner', false],
    ['manager', 'manager', false],
    ['manager', 'staff', true],
    ['manager', 'kitchen', true],
    ['manager', 'owner', false],
    ['staff', 'staff', false],
    ['staff', 'kitchen', false],
    ['kitchen', 'kitchen', false],
    ['kitchen', 'staff', false],
    ['owner', 'member', false],
    ['owner', 'admin', false],
  ] as const)('%s inviting %s: %s', (inviter, invited, allowed) => {
    expect(canInvite(inviter, invited)).toBe(allowed);
    expect(
      codeOf(() => {
        assertCanInvite(inviter, invited);
      }),
    ).toBe(allowed ? undefined : 'FORBIDDEN');
  });

  it('keeps a suspended organisation read-only', () => {
    expect(
      codeOf(() => {
        assertOrganizationWritable({ status: 'active' });
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        assertOrganizationWritable({ status: 'suspended' });
      }),
    ).toBe('ORG_SUSPENDED');
    // Anything unknown is treated as not writable.
    expect(
      codeOf(() => {
        assertOrganizationWritable({ status: 'other' });
      }),
    ).toBe('ORG_SUSPENDED');
  });
});
