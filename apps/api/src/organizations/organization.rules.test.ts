import { describe, expect, it } from 'vitest';

import {
  assertCan,
  can,
  DomainError,
  INVITABLE_ROLES,
  type InvitableRole,
  inviteActionFor,
  MEMBER_ROLES,
  type MemberActor,
  type MemberRole,
} from '@radd/shared';

import {
  assertAccountSession,
  assertCanCreateOrganization,
  assertOrganizationWritable,
  MAX_OWNED_ORGANIZATIONS,
} from './organization.rules';

const member = (role: MemberRole): MemberActor => ({
  kind: 'member',
  userId: '0190a000-0000-7000-8000-000000000002',
  organizationId: '0190a000-0000-7000-8000-000000000001',
  role,
  pinSession: false,
});

/** How `InvitationsService` decides: an unknown role is never invitable (the DTO refuses it too). */
function canInvite(inviter: MemberRole, invited: string): boolean {
  if (!(INVITABLE_ROLES as readonly string[]).includes(invited)) return false;
  return can(member(inviter), inviteActionFor(invited as InvitableRole));
}

function assertCanInvite(inviter: MemberRole, invited: string): void {
  if (!(INVITABLE_ROLES as readonly string[]).includes(invited)) {
    throw new DomainError('FORBIDDEN');
  }
  assertCan(member(inviter), inviteActionFor(invited as InvitableRole));
}

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

  it('lets any member read the organisation and its team', () => {
    for (const role of MEMBER_ROLES) {
      expect(can(member(role), 'org.read')).toBe(true);
      expect(can(member(role), 'team.read')).toBe(true);
    }
  });

  it('lets owners and managers rename the organisation', () => {
    expect(
      codeOf(() => {
        assertCan(member('owner'), 'org.update');
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        assertCan(member('manager'), 'org.update');
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        assertCan(member('staff'), 'org.update');
      }),
    ).toBe('FORBIDDEN');
    expect(
      codeOf(() => {
        assertCan(member('kitchen'), 'org.update');
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
