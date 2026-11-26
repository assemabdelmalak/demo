import { and, eq, isNull, sql } from 'drizzle-orm';

import { isUuid } from '@radd/shared';

import { type DbExecutor } from './client.js';
import { member, session } from './schema/auth.js';

// Staff devices and PINs (ADR-026): the reads and writes that happen before a tenant is known or
// on Better Auth's global tables (`member`, `session`; no RLS, ADR-022). Device rows themselves
// are tenant rows and go through `StaffDevicesRepository`. Kept here so the CommonJS API never
// imports drizzle-orm itself (see auth-queries.ts).

export interface StaffDeviceIdentity {
  id: string;
  organizationId: string;
  restaurantId: string;
  revokedAt: Date | null;
}

/**
 * The device whose token hashes to `tokenHash`, through the narrow `staff_device_by_token_hash()`
 * definer function: the cookie names the organisation, not the other way round. Undefined when no
 * device has that token.
 */
export async function findStaffDeviceByTokenHash(
  db: DbExecutor,
  tokenHash: string,
): Promise<StaffDeviceIdentity | undefined> {
  const result = await db.execute<{
    id: string;
    organization_id: string;
    restaurant_id: string;
    revoked_at: Date | string | null;
  }>(sql`select id, organization_id, restaurant_id, revoked_at
           from staff_device_by_token_hash(${tokenHash})`);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    organizationId: row.organization_id,
    restaurantId: row.restaurant_id,
    revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
  };
}

export type MemberRoleOf = (typeof member.$inferSelect)['role'];

export interface PinMember {
  id: string;
  userId: string;
  role: MemberRoleOf;
  pinHash: string | null;
  pinDisabledAt: Date | null;
}

/**
 * A member of `organizationId` with what the PIN switch and the PIN endpoints need. The hash is
 * read here and nowhere else; no endpoint returns it.
 */
export async function findMemberForPin(
  db: DbExecutor,
  organizationId: string,
  memberId: string,
): Promise<PinMember | undefined> {
  if (!isUuid(memberId)) return undefined;
  const [row] = await db
    .select({
      id: member.id,
      userId: member.userId,
      role: member.role,
      pinHash: member.pinHash,
      pinDisabledAt: member.pinDisabledAt,
    })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.id, memberId)))
    .limit(1);
  return row;
}

/**
 * Sets (or with `null` removes) a member's PIN hash. Either way the hard lock is cleared: a new
 * PIN is the manager's answer to a disabled one. False when the member is not in the organisation.
 */
export async function setMemberPinHash(
  db: DbExecutor,
  organizationId: string,
  memberId: string,
  pinHash: string | null,
): Promise<boolean> {
  const rows = await db
    .update(member)
    .set({ pinHash, pinDisabledAt: null })
    .where(and(eq(member.organizationId, organizationId), eq(member.id, memberId)))
    .returning({ id: member.id });
  return rows.length > 0;
}

/**
 * Disables a member's PIN after too many failures (ADR-026). Only the hash that was attacked is
 * disabled: if a manager set a new PIN in the meantime, that one stays usable.
 */
export async function disableMemberPin(
  db: DbExecutor,
  memberId: string,
  pinHash: string,
): Promise<void> {
  await db
    .update(member)
    .set({ pinDisabledAt: new Date() })
    .where(and(eq(member.id, memberId), eq(member.pinHash, pinHash), isNull(member.pinDisabledAt)));
}

/** Ends every session opened on a device; how many there were. */
export async function deleteStaffDeviceSessions(db: DbExecutor, deviceId: string): Promise<number> {
  const rows = await db
    .delete(session)
    .where(eq(session.staffDeviceId, deviceId))
    .returning({ id: session.id });
  return rows.length;
}

/** Ends one session, e.g. a PIN session past its 12 hours. */
export async function deleteSessionById(db: DbExecutor, sessionId: string): Promise<void> {
  if (!isUuid(sessionId)) return;
  await db.delete(session).where(eq(session.id, sessionId));
}
