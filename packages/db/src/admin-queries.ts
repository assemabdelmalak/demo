import { and, asc, eq, gt, ilike, or, sql } from 'drizzle-orm';

import { type DbExecutor } from './client.js';
import { member, organization } from './schema/auth.js';

// Super-admin reads and writes (ADR-027). Callers pass the transaction of `withAdmin()`, which
// connects as `app_admin` and bypasses RLS; nothing else may call these (the API's admin pool is
// provided to its admin module only). Kept here so the CommonJS API never imports drizzle-orm.

export interface AdminOrganizationRow {
  id: string;
  name: string;
  slug: string;
  plan: (typeof organization.$inferSelect)['plan'];
  status: string;
  memberCount: number;
  createdAt: Date;
}

// Qualified by hand: inside `sql`, Drizzle renders a column without its table, which in this
// correlated subquery would compare `member.organization_id` with `member.id` (always 0).
const memberCount = sql<number>`(
  select count(*)::int from ${member} m where m.organization_id = ${organization}.id
)`.mapWith(Number);

const columns = {
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  plan: organization.plan,
  status: organization.status,
  memberCount,
  createdAt: organization.createdAt,
};

/** `%`, `_` and `\` typed by an admin match themselves, not any character. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** One page of organisations in creation order (UUIDv7), optionally by name or slug. */
export async function listOrganizationsForAdmin(
  db: DbExecutor,
  {
    search,
    cursor,
    limit,
  }: { search?: string | undefined; cursor?: string | undefined; limit: number },
): Promise<{ items: AdminOrganizationRow[]; hasMore: boolean }> {
  const pattern = search ? likePattern(search) : undefined;
  const rows = await db
    .select(columns)
    .from(organization)
    .where(
      and(
        pattern
          ? or(ilike(organization.name, pattern), ilike(organization.slug, pattern))
          : undefined,
        cursor ? gt(organization.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(organization.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function findOrganizationForAdmin(
  db: DbExecutor,
  organizationId: string,
): Promise<AdminOrganizationRow | undefined> {
  const [row] = await db
    .select(columns)
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row;
}

/** Suspends or reinstates an organisation, or changes its plan. Undefined when there is none. */
export async function updateOrganizationForAdmin(
  db: DbExecutor,
  organizationId: string,
  changes: {
    status?: 'active' | 'suspended' | undefined;
    plan?: AdminOrganizationRow['plan'] | undefined;
  },
): Promise<AdminOrganizationRow | undefined> {
  const set: Partial<typeof organization.$inferInsert> = {};
  if (changes.status !== undefined) set.status = changes.status;
  if (changes.plan !== undefined) set.plan = changes.plan;
  const [updated] = await db
    .update(organization)
    .set(set)
    .where(eq(organization.id, organizationId))
    .returning({ id: organization.id });
  if (!updated) return undefined;
  return findOrganizationForAdmin(db, organizationId);
}
