import { headers } from 'next/headers';

import { type ApiClient, createApiClient } from '@radd/api-client';
import { loadEnv } from '@radd/config/env';
import { REQUEST_ID_HEADER } from '@radd/shared';

/**
 * Better Auth's cookies, in every environment's spelling: `radd.…` in production, `radd-staging.…`
 * and `radd-local.…` elsewhere (ADR-023), with the `__Secure-` prefix on HTTPS. The console's own
 * cookies (`radd_console_theme`, `NEXT_LOCALE`) do not match and stay out of API requests.
 */
const AUTH_COOKIE = /^(?:__Secure-|__Host-)?radd(?:-[a-z0-9]+)?\./;

/** The incoming `Cookie` header reduced to the API's session cookies, or null when none is left. */
export function authCookieHeader(cookie: string | null): string | null {
  if (!cookie) return null;
  const kept = cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const eq = part.indexOf('=');
      return eq > 0 && AUTH_COOKIE.test(part.slice(0, eq));
    });
  return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * API client for server components and route handlers. It forwards the request ID set by
 * proxy.ts, so the API logs this call under the same ID as the page request (P0-T09), and the
 * visitor's session cookie, so the API answers as them. Nothing else from the page request is
 * passed on.
 */
export async function serverApiClient(): Promise<ApiClient> {
  const incoming = await headers();
  const requestId = incoming.get(REQUEST_ID_HEADER);
  const cookie = authCookieHeader(incoming.get('cookie'));
  const forwarded: Record<string, string> = {};
  if (requestId) forwarded[REQUEST_ID_HEADER] = requestId;
  if (cookie) forwarded.cookie = cookie;
  return createApiClient({
    baseUrl: loadEnv('console').API_PUBLIC_URL,
    ...(Object.keys(forwarded).length > 0 ? { headers: forwarded } : {}),
  });
}
