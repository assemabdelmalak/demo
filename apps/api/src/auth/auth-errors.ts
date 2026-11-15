import { isAPIError } from 'better-auth/api';

import { codeForStatus, DomainError, type ErrorCode, isErrorCode } from '@radd/shared';

/** Better Auth's organisation codes that have a more precise problem code of ours. */
const MAPPED_CODES: Readonly<Record<string, ErrorCode>> = {
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'ALREADY_A_MEMBER',
  MEMBER_NOT_FOUND: 'NOT_A_MEMBER',
  USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: 'NOT_A_MEMBER',
  YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: 'NOT_A_MEMBER',
  ORGANIZATION_NOT_FOUND: 'NOT_FOUND',
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS: 'ORG_LIMIT_REACHED',
  YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION: 'EMAIL_NOT_VERIFIED',
  INVITATION_LIMIT_REACHED: 'CONFLICT',
};

/** The Better Auth error code, when `error` is one of its API errors. */
export function authErrorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const code: unknown = error.body?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * A Better Auth error from a server-side `auth.api.*` call as one of our problem codes, so routes
 * we wrap answer in problem+json with stable codes. Anything else is passed through unchanged.
 */
export function toDomainError(error: unknown): unknown {
  if (!isAPIError(error)) return error;
  const code = authErrorCode(error);
  if (code && isErrorCode(code)) return new DomainError(code);
  const mapped = code ? MAPPED_CODES[code] : undefined;
  if (mapped) return new DomainError(mapped);
  const status = error.statusCode;
  // A 5xx from Better Auth stays an internal error; only 4xx outcomes become client problems.
  if (status >= 500) return error;
  return new DomainError(codeForStatus(status));
}
