import { Inject, Injectable } from '@nestjs/common';

import {
  countOwnedOrganizations,
  type DbHandle,
  findMemberRole,
  findOrganization,
  listOrganizationMembers,
  type OrganizationRow,
  organizationSlugExists,
} from '@radd/db';
import {
  DomainError,
  type ListMembersQuery,
  type MemberList,
  type MemberRole,
  type OrganizationView,
  organizationSchema,
} from '@radd/shared';

import {
  assertAccountSession,
  assertCanCreateOrganization,
  assertCanUpdateOrganization,
  assertIsMember,
  assertOrganizationWritable,
} from './organization.rules';
import { slugCandidates } from './slug';
import { recordAuditLater } from '../audit/audit.seam';
import { authErrorCode, toDomainError } from '../auth/auth-errors';
import { type AuthSession } from '../auth/auth-session';
import { type Auth } from '../auth/auth.config';
import { AUTH } from '../auth/auth.module';
import { DB } from '../db/db.module';

/** The session's active organisation and the caller's role in it. */
export interface CurrentOrganization {
  organization: OrganizationRow;
  role: MemberRole;
}

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
  ) {}

  /**
   * "Current" is the session's active organisation: 404 when none is set, 403 NOT_A_MEMBER when
   * the user no longer belongs to it.
   */
  async current(session: AuthSession): Promise<CurrentOrganization> {
    const organizationId = session.activeOrganizationId;
    if (!organizationId) throw new DomainError('NOT_FOUND', { detail: 'No active organisation' });
    const organization = await findOrganization(this.handle.db, organizationId);
    if (!organization) throw new DomainError('NOT_FOUND', { detail: 'No active organisation' });
    const role = await findMemberRole(this.handle.db, organizationId, session.userId);
    assertIsMember(role);
    return { organization, role };
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
      recordAuditLater({
        action: 'organization.create',
        entityType: 'organization',
        entityId: row.id,
        organizationId: row.id,
        after: view,
      });
      return view;
    }
    throw new DomainError('CONFLICT', { detail: 'Could not find a free organisation slug' });
  }

  async read(session: AuthSession): Promise<OrganizationView> {
    const { organization } = await this.current(session);
    return toOrganizationView(organization);
  }

  /** Renames the current organisation. Only the name: everything else is server-owned. */
  async update(session: AuthSession, name: string, headers: Headers): Promise<OrganizationView> {
    assertAccountSession(session);
    const { organization, role } = await this.current(session);
    assertCanUpdateOrganization(role);
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
    recordAuditLater({
      action: 'organization.update',
      entityType: 'organization',
      entityId: row.id,
      organizationId: row.id,
      before: toOrganizationView(organization),
      after: view,
    });
    return view;
  }

  /** Any member may list the team. The PIN hash is never read. */
  async members(session: AuthSession, query: ListMembersQuery): Promise<MemberList> {
    const { organization } = await this.current(session);
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
