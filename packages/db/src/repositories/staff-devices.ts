import { and, asc, eq, gt, isNull } from 'drizzle-orm';

import { staffDevices } from '../schema/auth.js';
import { BaseTenantRepository } from '../tenant.js';

export interface StaffDeviceRow {
  id: string;
  organizationId: string;
  restaurantId: string;
  name: string;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

// The token hash is never selected: nothing outside the definer lookup needs it.
const columns = {
  id: staffDevices.id,
  organizationId: staffDevices.organizationId,
  restaurantId: staffDevices.restaurantId,
  name: staffDevices.name,
  lastSeenAt: staffDevices.lastSeenAt,
  revokedAt: staffDevices.revokedAt,
  createdAt: staffDevices.createdAt,
};

/**
 * Shared tablets of the current tenant (ADR-026). Every query also names the organisation, so a
 * missing policy would still not leak rows; RLS is the backstop.
 */
export class StaffDevicesRepository extends BaseTenantRepository {
  async create(input: {
    restaurantId: string;
    name: string;
    tokenHash: string;
    registeredByUserId: string;
  }): Promise<StaffDeviceRow> {
    const [row] = await this.tx
      .insert(staffDevices)
      .values({ ...input, organizationId: this.organizationId })
      .returning(columns);
    // An insert with RETURNING yields its row or throws.
    if (!row) throw new Error('staff device insert returned no row');
    return row;
  }

  async findById(deviceId: string): Promise<StaffDeviceRow | undefined> {
    const [row] = await this.tx
      .select(columns)
      .from(staffDevices)
      .where(
        and(eq(staffDevices.organizationId, this.organizationId), eq(staffDevices.id, deviceId)),
      )
      .limit(1);
    return row;
  }

  /** One page of a restaurant's devices in registration order (UUIDv7), revoked ones included. */
  async list(
    restaurantId: string,
    { cursor, limit }: { cursor?: string | undefined; limit: number },
  ): Promise<{ items: StaffDeviceRow[]; hasMore: boolean }> {
    const rows = await this.tx
      .select(columns)
      .from(staffDevices)
      .where(
        and(
          eq(staffDevices.organizationId, this.organizationId),
          eq(staffDevices.restaurantId, restaurantId),
          cursor ? gt(staffDevices.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(staffDevices.id))
      .limit(limit + 1);
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  /**
   * Marks the device revoked. Revoking twice keeps the first time. Undefined when the device is
   * not this organisation's.
   */
  async revoke(
    deviceId: string,
  ): Promise<{ before: StaffDeviceRow; after: StaffDeviceRow } | undefined> {
    const before = await this.findById(deviceId);
    if (!before) return undefined;
    if (before.revokedAt) return { before, after: before };
    const [after] = await this.tx
      .update(staffDevices)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(staffDevices.organizationId, this.organizationId),
          eq(staffDevices.id, deviceId),
          isNull(staffDevices.revokedAt),
        ),
      )
      .returning(columns);
    return { before, after: after ?? before };
  }

  /** Records that the device was just used. */
  async touch(deviceId: string): Promise<void> {
    await this.tx
      .update(staffDevices)
      .set({ lastSeenAt: new Date() })
      .where(
        and(eq(staffDevices.organizationId, this.organizationId), eq(staffDevices.id, deviceId)),
      );
  }
}
