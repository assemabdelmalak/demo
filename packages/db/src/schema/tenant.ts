import { type AnyPgColumn, foreignKey, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Tenant columns (DATA_MODEL §0). Every table that has `organization_id` gets Row Level Security
 * in the RLS migration; a test fails if one is missed (ADR-022).
 */
export const organizationId = () => uuid('organization_id').notNull();
export const restaurantId = () => uuid('restaurant_id').notNull();

export interface TenantParent {
  organizationId: AnyPgColumn;
  id: AnyPgColumn;
}

/**
 * Lets other tenant tables reference this one together with its organisation. Needed as the
 * target of `tenantFk`.
 */
export function orgIdUnique(table: string, self: TenantParent) {
  return unique(`${table}_org_id_uq`).on(self.organizationId, self.id);
}

/**
 * Foreign key on `(organization_id, <column>)` instead of `<column>` alone. Postgres checks
 * foreign keys without applying RLS, so a single-column key would let a crafted ID attach a row to
 * another organisation's parent. With the organisation in the key that is impossible (ADR-022).
 * A null `<column>` skips the check, as with any foreign key.
 */
export function tenantFk(
  name: string,
  self: { organizationId: AnyPgColumn },
  column: AnyPgColumn,
  parent: () => TenantParent,
  onDelete: 'no action' | 'cascade' = 'no action',
) {
  const target = parent();
  return foreignKey({
    name,
    columns: [self.organizationId, column],
    foreignColumns: [target.organizationId, target.id],
  }).onDelete(onDelete);
}
