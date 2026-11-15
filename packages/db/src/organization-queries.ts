import { and, asc, count, eq, gt } from 'drizzle-orm';

import { type DbExecutor } from './client.js';
import { member, organization, user } from './schema/auth.js';

// Organisation, member and invitation reads on Better Auth's global tables (no RLS, ADR-022).
// Writes go through Better Auth's server API so its hooks run; these are the reads around them.
// Every query is scoped by an organisation or user ID the caller has already resolved from the
// session. Kept here so the CommonJS API never imports drizzle-orm itself (see auth-queries.ts).

export type OrganizationRow = Pick<
  typeof organization.$inferSelect,
  'id' | 'name' | 'slug' | 'country' | 'plan' | 'status' | 'createdAt'
>;

export async function findOrganization(
  db: DbExecutor,
  organizationId: string,
): Promise<OrganizationRow | undefined> {
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      country: organization.country,
      plan: organization.plan,
      status: organization.status,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row;
}

export async function organizationSlugExists(db: DbExecutor, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);
  return row !== undefined;
}

export type MemberRoleValue = (typeof member.$inferSelect)['role'];

/** The user's role in the organisation, or undefined when they are not a member. */
export async function findMemberRole(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<MemberRoleValue | undefined> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return row?.role;
}

/** How many organisations the user owns (the onboarding limit counts these, not memberships). */
export async function countOwnedOrganizations(db: DbExecutor, userId: string): Promise<number> {
  const [row] = await db
    .select({ owned: count() })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, 'owner')));
  return row?.owned ?? 0;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRoleValue;
  displayName: string | null;
  createdAt: Date;
}

/**
 * One page of members in joining order (IDs are UUIDv7, so ID order is creation order). The PIN
 * hash is never selected. `hasMore` says whether another page follows the last item.
 */
export async function listOrganizationMembers(
  db: DbExecutor,
  organizationId: string,
  { cursor, limit }: { cursor?: string | undefined; limit: number },
): Promise<{ items: OrganizationMember[]; hasMore: boolean }> {
  const rows = await db
    .select({
      id: member.id,
      userId: member.userId,
      name: user.name,
      email: user.email,
      role: member.role,
      displayName: member.displayName,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      cursor
        ? and(eq(member.organizationId, organizationId), gt(member.id, cursor))
        : eq(member.organizationId, organizationId),
    )
    .orderBy(asc(member.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}
