/**
 * Failures from Better Auth (`/v1/auth/*`, its own JSON errors) and from our API (problem+json)
 * reduced to one shape, then to a message key under `errors` in the catalogues. Raw server text
 * is never shown (UX §8: errors say what happened and what to do next, in the reader's language).
 */
export type Failure =
  | { kind: 'rate-limited'; retryAfterSeconds: number | null }
  | { kind: 'network' }
  | { kind: 'code'; code: string; status: number }
  | { kind: 'unknown'; status: number | null };

export type Result<T> = { ok: true; data: T } | { ok: false; failure: Failure };

/** A message key under `errors` with its ICU values. */
export interface FailureMessage {
  key: ErrorMessageKey;
  values?: Record<string, number>;
}

export type ErrorMessageKey =
  | 'invalidCredentials'
  | 'emailNotVerified'
  | 'invalidCode'
  | 'codeExpired'
  | 'tooManyAttempts'
  | 'invalidTotp'
  | 'invalidBackupCode'
  | 'twoFactorExpired'
  | 'accountLocked'
  | 'wrongPassword'
  | 'passwordTooShort'
  | 'passwordTooLong'
  | 'invalidEmail'
  | 'rateLimited'
  | 'rateLimitedLater'
  | 'network'
  | 'unavailable'
  | 'orgLimit'
  | 'orgSuspended'
  | 'invitationNotFound'
  | 'notRecipient'
  | 'alreadyMember'
  | 'signedOut'
  | 'generic';

/**
 * Codes we can say something useful about. Better Auth answers a wrong password and an unknown
 * address with the same `INVALID_EMAIL_OR_PASSWORD`, so the message never says which it was.
 */
const MESSAGES: Readonly<Record<string, ErrorMessageKey>> = {
  // Better Auth core
  INVALID_EMAIL_OR_PASSWORD: 'invalidCredentials',
  EMAIL_NOT_VERIFIED: 'emailNotVerified',
  INVALID_PASSWORD: 'wrongPassword',
  PASSWORD_TOO_SHORT: 'passwordTooShort',
  PASSWORD_TOO_LONG: 'passwordTooLong',
  INVALID_EMAIL: 'invalidEmail',
  // Email codes
  INVALID_OTP: 'invalidCode',
  OTP_EXPIRED: 'codeExpired',
  TOO_MANY_ATTEMPTS: 'tooManyAttempts',
  // Two-factor
  INVALID_CODE: 'invalidTotp',
  INVALID_BACKUP_CODE: 'invalidBackupCode',
  INVALID_TWO_FACTOR_COOKIE: 'twoFactorExpired',
  OTP_HAS_EXPIRED: 'twoFactorExpired',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'twoFactorExpired',
  ACCOUNT_TEMPORARILY_LOCKED: 'accountLocked',
  // Organisations and invitations (Better Auth's codes and our problem codes)
  INVITATION_NOT_FOUND: 'invitationNotFound',
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: 'notRecipient',
  EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION: 'emailNotVerified',
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION: 'emailNotVerified',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'alreadyMember',
  ALREADY_A_MEMBER: 'alreadyMember',
  ORG_LIMIT_REACHED: 'orgLimit',
  ORG_SUSPENDED: 'orgSuspended',
  UNAUTHENTICATED: 'signedOut',
  RATE_LIMITED: 'rateLimitedLater',
  SERVICE_UNAVAILABLE: 'unavailable',
};

/** `Retry-After` in seconds; HTTP dates are not sent by our API, so only delta-seconds count. */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const seconds = Number(value.trim());
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * A Better Auth client error (`{ status, statusText, code?, message?, retryAfter? }`; the auth
 * client adds `retryAfter` from the response header) or anything else that went wrong.
 */
export function toAuthFailure(error: unknown): Failure {
  const status = field(error, 'status');
  if (typeof status !== 'number' || status === 0) return { kind: 'network' };
  // better-fetch reports a request that never got a response this way.
  if (field(error, 'statusText') === 'Fetch Error') return { kind: 'network' };
  if (status === 429) {
    const retryAfter = field(error, 'retryAfter');
    return {
      kind: 'rate-limited',
      retryAfterSeconds: typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : null,
    };
  }
  const code = field(error, 'code');
  if (typeof code === 'string' && code !== '') return { kind: 'code', code, status };
  return { kind: 'unknown', status };
}

/** An API problem response (`openapi-fetch`'s `error` plus the response). */
export function toApiFailure(problem: unknown, response: Response | undefined): Failure {
  if (!response) return { kind: 'network' };
  if (response.status === 429) {
    return {
      kind: 'rate-limited',
      retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
    };
  }
  const code = field(problem, 'code');
  if (typeof code === 'string' && code !== '') {
    return { kind: 'code', code, status: response.status };
  }
  return { kind: 'unknown', status: response.status };
}

/** Runs a Better Auth client call; a thrown error (offline, CORS) becomes a network failure. */
export async function runAuth<T>(
  call: () => Promise<{ data: T | null; error: unknown }>,
): Promise<Result<T>> {
  try {
    const { data, error } = await call();
    if (error !== null && error !== undefined) return { ok: false, failure: toAuthFailure(error) };
    if (data === null) return { ok: false, failure: { kind: 'unknown', status: null } };
    return { ok: true, data };
  } catch {
    return { ok: false, failure: { kind: 'network' } };
  }
}

/** Runs one of our API calls through the typed client. */
export async function runApi<T>(
  call: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<Result<T>> {
  try {
    const { data, error, response } = await call();
    if (data !== undefined && response.ok) return { ok: true, data };
    return { ok: false, failure: toApiFailure(error, response) };
  } catch {
    return { ok: false, failure: { kind: 'network' } };
  }
}

export function failureMessage(failure: Failure): FailureMessage {
  switch (failure.kind) {
    case 'network':
      return { key: 'network' };
    case 'rate-limited':
      return failure.retryAfterSeconds === null
        ? { key: 'rateLimitedLater' }
        : { key: 'rateLimited', values: { seconds: failure.retryAfterSeconds } };
    case 'code': {
      const key = MESSAGES[failure.code];
      if (key) return { key };
      return { key: failure.status >= 500 ? 'unavailable' : 'generic' };
    }
    case 'unknown':
      return { key: failure.status !== null && failure.status >= 500 ? 'unavailable' : 'generic' };
  }
}
