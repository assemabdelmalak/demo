import { Inject, Injectable } from '@nestjs/common';

import {
  countOwnedOrganizations,
  type DbHandle,
  findOrganization,
  listOrganizationMembers,
  type OrganizationRow,
  organizationSlugExists,
  withTenant,
} from '@radd/db';
import {
  assertCan,
  DomainError,
  type ListMembersQuery,
  type MemberActor,
  type MemberList,
  type OrganizationView,
  organizationSchema,
} from '@radd/shared';

import { assertCanCreateOrganization, assertOrganizationWritable } from './organization.rules';
import { slugCandidates } from './slug';
import { AuditService } from '../audit/audit.service';
import { authErrorCode, toDomainError } from '../auth/auth-errors';
import { type AuthSession } from '../auth/auth-session';
import { type Auth } from '../auth/auth.config';
import { AUTH } from '../auth/auth.module';
import { DB } from '../db/db.module';

export function toOrganizationView(row: OrganizationRow): OrganizationView {
  return organizationSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
}

/**
 * Onboarding, the current organisation and its members. `organization` and `member` are Better
 * Auth's global tables (no RLS, ADR-022): every read is scoped by an organisation the session's
 * user is checked to belong to, and writes go through Better Auth's server API so its hooks run.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly audit: AuditService,
  ) {}

  /**
   * "Current" is the organisation the guard resolved for the request: the session's active one,
   * whose membership `AuthzGuard` has checked (404 without one, 403 NOT_A_MEMBER outside it).
   */
  async current(actor: MemberActor): Promise<OrganizationRow> {
    const organization = await findOrganization(this.handle.db, actor.organizationId);
    if (!organization) throw new DomainError('NOT_FOUND', { detail: 'No active organisation' });
    return organization;
  }

  /** Onboarding step 0: the caller becomes owner and the new organisation becomes active. */
  async create(session: AuthSession, name: string, headers: Headers): Promise<OrganizationView> {
    const owned = await countOwnedOrganizations(this.handle.db, session.userId);
    assertCanCreateOrganization(session, owned);

    for (const slug of slugCandidates(name)) {
      if (await organizationSlugExists(this.handle.db, slug)) continue;
      let createdId: string;
      try {
        // Better Auth makes the caller `owner` (creatorRole) and sets the session's active
        // organisation. Plan, status and country keep their server defaults; no subscription
        // row is written (plans are P9).
        const created = await this.auth.api.createOrganization({ headers, body: { name, slug } });
        createdId = created.id;
      } catch (error) {
        // Another request took the slug between our check and the insert; try the next one.
        if (authErrorCode(error) === 'ORGANIZATION_ALREADY_EXISTS') continue;
        throw toDomainError(error);
      }
      const row = await findOrganization(this.handle.db, createdId);
      if (!row) throw new Error('organisation vanished right after it was created');
      const view = toOrganizationView(row);
      // Onboarding has no tenant transaction (the organisation did not exist), and Better Auth
      // has already committed it; the entry gets a short transaction of the new tenant's own.
      await withTenant(this.handle.db, row.id, () =>
        this.audit.record({
          action: 'organization.create',
          entityType: 'organization',
          entityId: row.id,
          after: view,
        }),
      );
      return view;
    }
    throw new DomainError('CONFLICT', { detail: 'Could not find a free organisation slug' });
  }

  async read(actor: MemberActor): Promise<OrganizationView> {
    assertCan(actor, 'org.read');
    return toOrganizationView(await this.current(actor));
  }

  /** Renames the current organisation. Only the name: everything else is server-owned. */
  async update(actor: MemberActor, name: string, headers: Headers): Promise<OrganizationView> {
    // A PIN session never holds `org.*` (ADR-026), so this also refuses account changes there.
    assertCan(actor, 'org.update');
    const organization = await this.current(actor);
    assertOrganizationWritable(organization);
    try {
      await this.auth.api.updateOrganization({
        headers,
        body: { organizationId: organization.id, data: { name } },
      });
    } catch (error) {
      throw toDomainError(error);
    }
    const row = await findOrganization(this.handle.db, organization.id);
    if (!row) throw new DomainError('NOT_FOUND');
    const view = toOrganizationView(row);
    await this.audit.record({
      action: 'organization.update',
      entityType: 'organization',
      entityId: row.id,
      before: toOrganizationView(organization),
      after: view,
    });
    return view;
  }

  /** Any member may list the team. The PIN hash is never read. */
  async members(actor: MemberActor, query: ListMembersQuery): Promise<MemberList> {
    assertCan(actor, 'team.read');
    const organization = await this.current(actor);
    const { items, hasMore } = await listOrganizationMembers(
      this.handle.db,
      organization.id,
      query,
    );
    const last = items.at(-1);
    return {
      items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      nextCursor: hasMore && last ? last.id : null,
    };
  }
}
