import { fromNodeHeaders } from 'better-auth/node';
import { type FastifyRequest } from 'fastify';

import { DomainError, type UiLocale } from '@radd/shared';

import { type AuthSession } from '../auth/auth-session';
import { LOCALE_HEADER, parseLocaleHeader } from '../auth/auth.utils';

/** The signed-in session, or 401. Replaced by `@CurrentActor()` in P1-T05. */
export function requireSession(request: FastifyRequest): AuthSession {
  if (!request.authSession) throw new DomainError('UNAUTHENTICATED');
  return request.authSession;
}

/** The request's headers for a server-side Better Auth call (it reads the session cookie). */
export function authHeaders(request: FastifyRequest): Headers {
  return fromNodeHeaders(request.headers);
}

export function requestLocale(request: FastifyRequest): UiLocale {
  const value = request.headers[LOCALE_HEADER];
  return parseLocaleHeader(Array.isArray(value) ? value[0] : value);
}
