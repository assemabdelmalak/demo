import { asc, eq } from 'drizzle-orm';

import { type DbExecutor } from './client.js';
import { member, organization, user } from './schema/auth.js';

// Reads of Better Auth's global tables (no RLS, ADR-022) that the API needs outside Better Auth.
// They live here so the API, a CommonJS build, never imports drizzle-orm itself: its CommonJS and
// ESM type declarations are distinct, and mixing them breaks the query builder's types.

export interface UserAuthFlags {
  id: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

/** By address, as Better Auth stores it (lower case). */
export async function findUserAuthFlags(
  db: DbExecutor,
  email: string,
): Promise<UserAuthFlags | undefined> {
  const [row] = await db
    .select({
      id: user.id,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1);
  return row;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

export async function findUserProfile(
  db: DbExecutor,
  userId: string,
): Promise<UserProfile | undefined> {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row;
}

export interface UserMembership {
  organizationId: string;
  name: string;
  slug: string;
  role: (typeof member.$inferSelect)['role'];
}

/** Every organisation the user belongs to, by name. */
export function listUserMemberships(db: DbExecutor, userId: string): Promise<UserMembership[]> {
  return db
    .select({
      organizationId: member.organizationId,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name), asc(member.organizationId));
}
