import { fromNodeHeaders } from 'better-auth/node';
import { type FastifyRequest } from 'fastify';

import { type UiLocale } from '@radd/shared';

import { LOCALE_HEADER, parseLocaleHeader } from '../auth/auth.utils';

/** The request's headers for a server-side Better Auth call (it reads the session cookie). */
export function authHeaders(request: FastifyRequest): Headers {
  return fromNodeHeaders(request.headers);
}

export function requestLocale(request: FastifyRequest): UiLocale {
  const value = request.headers[LOCALE_HEADER];
  return parseLocaleHeader(Array.isArray(value) ? value[0] : value);
}
