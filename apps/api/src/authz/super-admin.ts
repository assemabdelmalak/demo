import { type AuthSession } from '../auth/auth-session';

/** How recent the TOTP check on the session must be for admin access (ADR-027). */
export const SUPER_ADMIN_TWO_FACTOR_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Whether a session is a super admin's, and if not, why. Pure, so the guard, Bull Board's hook and
 * `GET /v1/me` give the same answer.
 *
 * - `not_admin`: signed in as someone who is not on the allowlist, or is on it without a verified
 *   address or two-factor, or through a PIN session. Answered like any other forbidden route.
 * - `two_factor_required`: an allowlisted admin whose session has no TOTP check in the last 12
 *   hours. A trusted-device sign-in skips the check, so it lands here too.
 */
export type SuperAdminVerdict = 'super_admin' | 'not_admin' | 'two_factor_required';

export function superAdminVerdict(
  session: Pick<
    AuthSession,
    'email' | 'emailVerified' | 'twoFactorEnabled' | 'twoFactorVerifiedAt' | 'pinSession'
  >,
  allowlist: readonly string[],
  now: Date = new Date(),
): SuperAdminVerdict {
  const email = session.email.trim().toLowerCase();
  const listed = allowlist.some((entry) => entry.trim().toLowerCase() === email);
  if (!listed || !session.emailVerified || !session.twoFactorEnabled || session.pinSession) {
    return 'not_admin';
  }
  const verifiedAt = session.twoFactorVerifiedAt?.getTime();
  if (verifiedAt === undefined || Number.isNaN(verifiedAt)) return 'two_factor_required';
  const age = now.getTime() - verifiedAt;
  // A stamp from the future is not trusted either (clock skew or a tampered row).
  if (age < -60_000 || age > SUPER_ADMIN_TWO_FACTOR_MAX_AGE_MS) return 'two_factor_required';
  return 'super_admin';
}
