import { Injectable } from '@nestjs/common';

import {
  currentTenantScope,
  deleteStaffDeviceSessions,
  type StaffDeviceRow,
  StaffDevicesRepository,
} from '@radd/db';
import {
  assertCan,
  type CreateStaffDeviceInput,
  DomainError,
  type ListStaffDevicesQuery,
  type MemberActor,
  type StaffDeviceList,
  type StaffDeviceView,
  staffDeviceSchema,
} from '@radd/shared';

import { hashDeviceToken, newDeviceToken } from './device-cookie';
import { recordAuditLater } from '../audit/audit.seam';

export function toStaffDeviceView(row: StaffDeviceRow): StaffDeviceView {
  return staffDeviceSchema.parse({
    id: row.id,
    restaurantId: row.restaurantId,
    name: row.name,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

const deviceNotFound = () => new DomainError('NOT_FOUND', { detail: 'Device not found' });

/**
 * Shared tablets (ADR-026). Every method runs in the request's tenant transaction, so a device of
 * another organisation is simply not found.
 */
@Injectable()
export class StaffDevicesService {
  constructor(private readonly devices: StaffDevicesRepository) {}

  /**
   * Registers a device and returns its token for the caller to put in the cookie. The token is
   * never stored, logged or put in the response body; only its SHA-256 is kept.
   */
  async register(
    actor: MemberActor,
    restaurantId: string,
    input: CreateStaffDeviceInput,
  ): Promise<{ device: StaffDeviceView; token: string }> {
    assertCan(actor, 'devices.manage');
    const token = newDeviceToken();
    const row = await this.devices.create({
      restaurantId,
      name: input.name,
      tokenHash: hashDeviceToken(token),
      registeredByUserId: actor.userId,
    });
    const device = toStaffDeviceView(row);
    recordAuditLater({
      action: 'staff_device.register',
      entityType: 'staff_device',
      entityId: row.id,
      organizationId: row.organizationId,
      after: device,
    });
    return { device, token };
  }

  async list(
    actor: MemberActor,
    restaurantId: string,
    query: ListStaffDevicesQuery,
  ): Promise<StaffDeviceList> {
    assertCan(actor, 'devices.manage');
    const { items, hasMore } = await this.devices.list(restaurantId, query);
    const last = items.at(-1);
    return { items: items.map(toStaffDeviceView), nextCursor: hasMore && last ? last.id : null };
  }

  /** Revokes the device and ends every session opened on it, in one transaction. */
  async revoke(actor: MemberActor, deviceId: string): Promise<StaffDeviceView> {
    assertCan(actor, 'devices.manage');
    const result = await this.devices.revoke(deviceId);
    if (!result) throw deviceNotFound();
    const scope = currentTenantScope();
    if (!scope) throw new Error('revoke needs the request transaction');
    const endedSessions = await deleteStaffDeviceSessions(scope.tx, deviceId);
    const before = toStaffDeviceView(result.before);
    const after = toStaffDeviceView(result.after);
    recordAuditLater({
      action: 'staff_device.revoke',
      entityType: 'staff_device',
      entityId: deviceId,
      organizationId: result.after.organizationId,
      before,
      after: { ...after, endedSessions },
    });
    return after;
  }
}
