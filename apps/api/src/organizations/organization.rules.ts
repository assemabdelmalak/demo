import { DomainError, type InvitableRole, type MemberRole } from '@radd/shared';

// Who may do what with organisations, members and invitations. One function per rule, each
// throwing a problem code, so the permission layer of P1-T05 (`assertCan` over the matrix in
// packages/shared/permissions.ts) can replace them one by one.

/** Onboarding limit: one person runs at most this many organisations (as owner). */
export const MAX_OWNED_ORGANIZATIONS = 3;

/** The parts of the session the rules look at. */
export interface RuleActor {
  emailVerified: boolean;
  pinSession: boolean;
}

/** A shared-tablet PIN session is for floor and kitchen work only, never account changes (ADR-026). */
export function assertAccountSession(actor: RuleActor): void {
  if (actor.pinSession)
    throw new DomainError('FORBIDDEN', { detail: 'Not available in a PIN session' });
}

/** Creating an organisation needs a confirmed address and room under the ownership limit. */
export function assertCanCreateOrganization(actor: RuleActor, ownedCount: number): void {
  assertAccountSession(actor);
  if (!actor.emailVerified) throw new DomainError('EMAIL_NOT_VERIFIED');
  if (ownedCount >= MAX_OWNED_ORGANIZATIONS) {
    throw new DomainError('ORG_LIMIT_REACHED', {
      detail: `A person can own at most ${String(MAX_OWNED_ORGANIZATIONS)} organisations`,
    });
  }
}

/** Reads of the organisation and its member list: any member. */
export function assertIsMember(role: MemberRole | undefined): asserts role is MemberRole {
  if (role === undefined) throw new DomainError('NOT_A_MEMBER');
}

/** Renaming the organisation: owner or manager. */
export function assertCanUpdateOrganization(role: MemberRole): void {
  if (role !== 'owner' && role !== 'manager') throw new DomainError('FORBIDDEN');
}

/** Which roles each role may invite. Owners are never invited; managing managers is owner-only. */
const INVITABLE_BY: Record<MemberRole, readonly InvitableRole[]> = {
  owner: ['manager', 'staff', 'kitchen'],
  manager: ['staff', 'kitchen'],
  staff: [],
  kitchen: [],
};

export function canInvite(inviter: MemberRole, invited: string): boolean {
  return (INVITABLE_BY[inviter] as readonly string[]).includes(invited);
}

export function assertCanInvite(inviter: MemberRole, invited: string): void {
  if (!canInvite(inviter, invited)) {
    throw new DomainError('FORBIDDEN', { detail: `A ${inviter} cannot invite a ${invited}` });
  }
}

/** A suspended organisation stays readable, but nothing in it may change. */
export function assertOrganizationWritable(organization: { status: string }): void {
  if (organization.status !== 'active') throw new DomainError('ORG_SUSPENDED');
}
