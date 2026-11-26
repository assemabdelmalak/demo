import { DomainError } from '@radd/shared';

// Organisation rules that are not role permissions: the onboarding limit, PIN sessions and
// suspension. Who may do what by role is `assertCan` over the matrix in
// packages/shared/src/permissions.ts (ADR-025).

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

/** A suspended organisation stays readable, but nothing in it may change. */
export function assertOrganizationWritable(organization: { status: string }): void {
  if (organization.status !== 'active') throw new DomainError('ORG_SUSPENDED');
}
