import {
  type DbHandle,
  deleteSessionById,
  findStaffDeviceByTokenHash,
  type StaffDeviceIdentity,
} from '@radd/db';

import { type AuthSession } from './auth-session';
import { type DeviceCookieSpec, hashDeviceToken, readDeviceToken } from '../staff/device-cookie';

/**
 * A PIN session ends 12 hours after it was opened, whatever Better Auth's sliding refresh would
 * allow (ADR-026). Counted from `createdAt`, which no refresh changes.
 */
export const PIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Better Auth paths a PIN session may call; everything else under `/v1/auth` is refused. */
export const PIN_SESSION_AUTH_PATHS: ReadonlySet<string> = new Set(['/get-session', '/sign-out']);

export type PinSessionVerdict =
  | { ok: true; organizationId: string; restaurantId: string }
  | {
      ok: false;
      reason: 'expired' | 'no_device_cookie' | 'wrong_device' | 'device_revoked';
      /** Whether the session row must be deleted, not just ignored for this request. */
      end: boolean;
    };

type PinSessionFields = Pick<AuthSession, 'staffDeviceId' | 'createdAt'>;

/**
 * Whether a PIN session may act on this request (pure; `PinSessionGate` gathers the inputs).
 *
 * - Older than 12 hours, or its device revoked or gone: invalid, and the session is ended.
 * - The request does not carry the device's own cookie (device-bound, SECURITY T7): invalid for
 *   this request only. The console's server renders pages with the session cookie alone (the
 *   device cookie is host-only on the API), so ending the session there would sign the tablet out.
 * - Otherwise valid, in the device's organisation, whatever the session row says.
 */
export function pinSessionVerdict(
  session: PinSessionFields,
  device: StaffDeviceIdentity | undefined,
  hasDeviceCookie: boolean,
  now: Date = new Date(),
): PinSessionVerdict {
  if (now.getTime() - session.createdAt.getTime() >= PIN_SESSION_TTL_MS) {
    return { ok: false, reason: 'expired', end: true };
  }
  if (!session.staffDeviceId) return { ok: false, reason: 'wrong_device', end: true };
  if (!hasDeviceCookie) return { ok: false, reason: 'no_device_cookie', end: false };
  if (!device || device.id !== session.staffDeviceId) {
    return { ok: false, reason: 'wrong_device', end: false };
  }
  if (device.revokedAt) return { ok: false, reason: 'device_revoked', end: true };
  return { ok: true, organizationId: device.organizationId, restaurantId: device.restaurantId };
}

/** The latest moment a PIN session opened at `createdAt` may expire. */
export function pinSessionDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PIN_SESSION_TTL_MS);
}

/**
 * Checks a PIN session against its device on every request (ADR-026): the auth bridge's session
 * hook for API routes, and the bridge itself for `/v1/auth/*`.
 */
export class PinSessionGate {
  constructor(
    private readonly handle: DbHandle,
    readonly cookie: DeviceCookieSpec,
  ) {}

  async check(
    session: PinSessionFields & { sessionId: string },
    cookieHeader: string | undefined,
  ): Promise<PinSessionVerdict> {
    const token = readDeviceToken(cookieHeader, this.cookie.name);
    const device = token
      ? await findStaffDeviceByTokenHash(this.handle.db, hashDeviceToken(token))
      : undefined;
    const verdict = pinSessionVerdict(session, device, token !== undefined);
    if (!verdict.ok && verdict.end) await deleteSessionById(this.handle.db, session.sessionId);
    return verdict;
  }
}
