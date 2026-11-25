import { Inject, Injectable } from '@nestjs/common';

import {
  type AdminOrganizationRow,
  type DbHandle,
  findOrganizationForAdmin,
  listOrganizationsForAdmin,
  updateOrganizationForAdmin,
  withAdmin,
} from '@radd/db';
import {
  type AdminListOrganizationsQuery,
  type AdminOrganizationList,
  type AdminOrganizationView,
  type AdminUpdateOrganizationInput,
  adminOrganizationSchema,
  DomainError,
  type SuperAdminActor,
} from '@radd/shared';

import { ADMIN_DB } from './admin-db';
import { AuditService } from '../audit/audit.service';

export function toAdminOrganizationView(row: AdminOrganizationRow): AdminOrganizationView {
  return adminOrganizationSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
}

const organizationNotFound = () =>
  new DomainError('NOT_FOUND', { detail: 'Organisation not found' });

/**
 * Organisations as the platform operator sees them (API §5, ADR-027). Every call runs in a
 * `withAdmin` transaction on the admin pool; the route guard has already checked the super admin.
 * `actor` is taken anyway, so a call from anywhere else cannot forget who acts.
 */
@Injectable()
export class AdminOrganizationsService {
  constructor(
    @Inject(ADMIN_DB) private readonly handle: DbHandle,
    private readonly audit: AuditService,
  ) {}

  async list(
    _actor: SuperAdminActor,
    query: AdminListOrganizationsQuery,
  ): Promise<AdminOrganizationList> {
    const { items, hasMore } = await withAdmin(this.handle.db, (tx) =>
      listOrganizationsForAdmin(tx, query),
    );
    const last = items.at(-1);
    return {
      items: items.map(toAdminOrganizationView),
      nextCursor: hasMore && last ? last.id : null,
    };
  }

  async read(_actor: SuperAdminActor, organizationId: string): Promise<AdminOrganizationView> {
    const row = await withAdmin(this.handle.db, (tx) =>
      findOrganizationForAdmin(tx, organizationId),
    );
    if (!row) throw organizationNotFound();
    return toAdminOrganizationView(row);
  }

  /** Suspends or reinstates an organisation, or changes its plan; audited with before and after. */
  async update(
    _actor: SuperAdminActor,
    organizationId: string,
    input: AdminUpdateOrganizationInput,
  ): Promise<AdminOrganizationView> {
    return withAdmin(this.handle.db, async (tx) => {
      const before = await findOrganizationForAdmin(tx, organizationId);
      if (!before) throw organizationNotFound();
      const after = await updateOrganizationForAdmin(tx, organizationId, input);
      if (!after) throw organizationNotFound();
      const beforeView = toAdminOrganizationView(before);
      const afterView = toAdminOrganizationView(after);
      // In the admin transaction: the entry commits or rolls back with the change. The actor is
      // the super admin the guard resolved (actor type `super_admin`).
      await this.audit.recordIn(tx, organizationId, {
        action: 'admin.organization.update',
        entityType: 'organization',
        entityId: organizationId,
        before: { status: beforeView.status, plan: beforeView.plan },
        after: { status: afterView.status, plan: afterView.plan },
      });
      return afterView;
    });
  }
}
