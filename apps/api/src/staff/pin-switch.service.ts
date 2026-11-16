import { Inject, Injectable, Logger } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { type FastifyRequest } from 'fastify';

import {
  type DbHandle,
  deleteSessionById,
  disableMemberPin,
  findMemberForPin,
  findStaffDeviceByTokenHash,
  type PinMember,
  StaffDevicesRepository,
  type StaffDeviceIdentity,
  withTenant,
} from '@radd/db';
import {
  DomainError,
  type MemberRole,
  type PinSwitchInput,
  type PinSwitchResult,
} from '@radd/shared';

import { type DeviceCookieSpec, hashDeviceToken, readDeviceToken } from './device-cookie';
import { PinHasher } from './pin-hasher';
import {
  type PinAttempt,
  type PinAttemptKey,
  PinLockout,
  PinLockoutUnavailableError,
  pinGeneration,
  retryAfterSeconds,
} from './pin-lockout';
import { recordAuditLater } from '../audit/audit.seam';
import { type Auth } from '../auth/auth.config';
import { AUTH } from '../auth/auth.module';
import { CLIENT_IP_HEADER, toAuthClientIp } from '../auth/auth.utils';
import { DB } from '../db/db.module';

/** Injection token of the device cookie's name and attributes. */
export const DEVICE_COOKIE = Symbol('DEVICE_COOKIE');

/** Only these roles use a PIN on a shared tablet (ADR-026). */
const PIN_ROLES: ReadonlySet<MemberRole> = new Set(['staff', 'kitchen']);

/**
 * The one answer for every reason a switch is refused: wrong device, unknown member, wrong role,
 * no PIN, wrong PIN. Nothing in it says which, so it cannot be used to find members or devices.
 */
const switchRefused = () => new DomainError('FORBIDDEN', { detail: 'PIN switch refused' });

export interface PinSwitchOutcome {
  result: PinSwitchResult;
  /** Better Auth's session cookie for the member, to send on the response. */
  setCookies: string[];
}

/**
 * Switches a shared tablet to a staff or kitchen member by PIN (ADR-026, SECURITY T7).
 *
 * Order matters: the device cookie and the member are read first (no secret is checked yet),
 * then the attempt is counted in Valkey, and only then is the PIN verified, with exactly one
 * argon2id verification on every path so timing says nothing. Valkey unreachable: refused.
 */
@Injectable()
export class PinSwitchService {
  private readonly logger = new Logger(PinSwitchService.name);

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DEVICE_COOKIE) private readonly cookie: DeviceCookieSpec,
    @Inject(PinHasher) private readonly hasher: PinHasher,
    @Inject(PinLockout) private readonly lockout: PinLockout,
    private readonly devices: StaffDevicesRepository,
  ) {}

  async switch(
    deviceId: string,
    input: PinSwitchInput,
    request: FastifyRequest,
  ): Promise<PinSwitchOutcome> {
    const device = await this.deviceOf(request, deviceId);
    if (device?.revokedAt) {
      await this.hasher.verify(undefined, input.pin);
      throw new DomainError('DEVICE_REVOKED');
    }
    const member = device
      ? await findMemberForPin(this.handle.db, device.organizationId, input.memberId)
      : undefined;
    const eligible = member !== undefined && PIN_ROLES.has(member.role) && member.pinHash !== null;

    // A PIN a manager has not reset since it was disabled: no counting, nothing to guess.
    if (device && eligible && member.pinDisabledAt) {
      await this.hasher.verify(undefined, input.pin);
      throw pinDisabled();
    }

    const key: PinAttemptKey = {
      deviceId,
      memberId: input.memberId,
      generation: pinGeneration(member?.pinHash),
    };
    const attempt = await this.begin(key, device !== undefined);
    if (attempt.kind === 'rate_limited') {
      throw new DomainError('RATE_LIMITED', {
        extensions: { retryAfter: retryAfterSeconds(attempt.retryAfterMs) },
      });
    }
    if (attempt.kind === 'locked') {
      throw new DomainError('PIN_LOCKED', {
        extensions: { retryAfter: retryAfterSeconds(attempt.retryAfterMs), pinDisabled: false },
      });
    }
    if (attempt.kind === 'disabled') {
      if (eligible) await disableMemberPin(this.handle.db, member.id, member.pinHash ?? '');
      throw pinDisabled();
    }

    const verified = await this.hasher.verify(eligible ? member.pinHash : undefined, input.pin);
    if (!device || !eligible || !verified) {
      await this.recordFailure(key, attempt, device ? member : undefined);
      throw switchRefused();
    }

    await this.guard(() => this.lockout.succeed(key));
    return this.open(device, member, request);
  }

  /** The device whose cookie the request carries, only if it is the device in the URL. */
  private async deviceOf(
    request: FastifyRequest,
    deviceId: string,
  ): Promise<StaffDeviceIdentity | undefined> {
    const token = readDeviceToken(request.headers.cookie, this.cookie.name);
    if (!token) return undefined;
    const device = await findStaffDeviceByTokenHash(this.handle.db, hashDeviceToken(token));
    return device?.id === deviceId ? device : undefined;
  }

  private begin(key: PinAttemptKey, count: boolean): Promise<PinAttempt> {
    return this.guard(() => this.lockout.begin(key, count));
  }

  private async recordFailure(
    key: PinAttemptKey,
    attempt: Extract<PinAttempt, { kind: 'proceed' }>,
    member: PinMember | undefined,
  ): Promise<void> {
    const outcome = await this.guard(() => this.lockout.fail(key, attempt));
    if (outcome.disable && member?.pinHash) {
      await disableMemberPin(this.handle.db, member.id, member.pinHash);
      this.logger.warn({ memberId: member.id }, 'PIN disabled after too many failures');
    }
  }

  /** Fails closed: without Valkey nothing limits guessing, so no PIN is checked at all. */
  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof PinLockoutUnavailableError)) throw error;
      this.logger.warn({ err: error.cause }, 'PIN lockout store unavailable; switch refused');
      throw new DomainError('SERVICE_UNAVAILABLE', {
        detail: 'PIN switch is unavailable',
        extensions: { retryAfter: 30 },
      });
    }
  }

  private async open(
    device: StaffDeviceIdentity,
    member: PinMember,
    request: FastifyRequest,
  ): Promise<PinSwitchOutcome> {
    // Whoever used the tablet before is signed out of it first.
    if (request.authSession) await deleteSessionById(this.handle.db, request.authSession.sessionId);

    const { headers, response } = await this.auth.api.createPinSession({
      body: {
        userId: member.userId,
        organizationId: device.organizationId,
        staffDeviceId: device.id,
      },
      headers: this.authHeaders(request),
      returnHeaders: true,
    });
    await withTenant(this.handle.db, device.organizationId, () => this.devices.touch(device.id));
    recordAuditLater({
      action: 'staff.pin_switch',
      entityType: 'member',
      entityId: member.id,
      organizationId: device.organizationId,
      after: { staffDeviceId: device.id, sessionId: response.sessionId },
    });
    return {
      result: {
        memberId: member.id,
        organizationId: device.organizationId,
        restaurantId: device.restaurantId,
        expiresAt: new Date(response.expiresAt).toISOString(),
      },
      setCookies: headers.getSetCookie(),
    };
  }

  /** The request's headers for Better Auth, with the client IP header set by us alone (ADR-016). */
  private authHeaders(request: FastifyRequest): Headers {
    const headers = fromNodeHeaders(request.headers);
    headers.delete(CLIENT_IP_HEADER);
    const clientIp = toAuthClientIp(request.clientIp);
    if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp);
    return headers;
  }
}

function pinDisabled(): DomainError {
  return new DomainError('PIN_LOCKED', {
    detail: 'This PIN is disabled until a manager sets a new one',
    extensions: { pinDisabled: true },
  });
}
