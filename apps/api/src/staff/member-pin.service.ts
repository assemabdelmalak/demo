import { Inject, Injectable } from '@nestjs/common';

import { currentTenantScope, findMemberForPin, setMemberPinHash } from '@radd/db';
import { assertCan, DomainError, type MemberActor } from '@radd/shared';

import { PinHasher } from './pin-hasher';
import { AuditService } from '../audit/audit.service';

const memberNotFound = () => new DomainError('NOT_FOUND', { detail: 'Member not found' });

/**
 * Sets and removes quick-switch PINs (ADR-026). A manager manages staff and kitchen PINs, an
 * owner the same; nobody sets an owner's or manager's PIN, since they never use one. Setting a
 * PIN clears the hard lock that 15 failures in a day leave.
 */
@Injectable()
export class MemberPinService {
  constructor(
    @Inject(PinHasher) private readonly hasher: PinHasher,
    private readonly audit: AuditService,
  ) {}

  async set(actor: MemberActor, memberId: string, pin: string): Promise<void> {
    const target = await this.target(actor, memberId);
    const pinHash = await this.hasher.hash(pin);
    if (!(await setMemberPinHash(this.tx(), actor.organizationId, target.id, pinHash))) {
      throw memberNotFound();
    }
    // Never the PIN or its hash: only that it changed.
    await this.audit.record({
      action: 'member.pin.set',
      entityType: 'member',
      entityId: target.id,
      before: { hasPin: target.pinHash !== null, pinDisabled: target.pinDisabledAt !== null },
      after: { hasPin: true, pinDisabled: false },
    });
  }

  async remove(actor: MemberActor, memberId: string): Promise<void> {
    const target = await this.target(actor, memberId);
    if (!(await setMemberPinHash(this.tx(), actor.organizationId, target.id, null))) {
      throw memberNotFound();
    }
    await this.audit.record({
      action: 'member.pin.remove',
      entityType: 'member',
      entityId: target.id,
      before: { hasPin: target.pinHash !== null, pinDisabled: target.pinDisabledAt !== null },
      after: { hasPin: false, pinDisabled: false },
    });
  }

  /** The member in the actor's organisation whose PIN the actor may manage. */
  private async target(actor: MemberActor, memberId: string) {
    const target = await findMemberForPin(this.tx(), actor.organizationId, memberId);
    if (!target) throw memberNotFound();
    assertCan(actor, 'team.pin.set', { targetRole: target.role });
    return target;
  }

  /** `member` is a global table; the request transaction is used so the change is audited with it. */
  private tx() {
    const scope = currentTenantScope();
    if (!scope) throw new Error('PIN changes need the request transaction');
    return scope.tx;
  }
}
