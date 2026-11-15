import { DEFAULT_LOCALE, isUiLocale, isUuid, type UiLocale } from '@radd/shared';

import { type ApiEnv } from '../config/env.module';

/**
 * The console sends the reader's language on auth requests so the code email matches the page
 * they are on. Anything else falls back to English (ADR-009).
 */
export const LOCALE_HEADER = 'x-radd-locale';

/**
 * Private header the auth bridge overwrites with `request.clientIp` on every request, so Better
 * Auth's limiter and session tracking never read a client-chosen address (ADR-016).
 */
export const CLIENT_IP_HEADER = 'x-radd-client-ip';

export function parseLocaleHeader(value: string | null | undefined): UiLocale {
  const candidate = value?.trim().toLowerCase();
  return isUiLocale(candidate) ? candidate : DEFAULT_LOCALE;
}

/**
 * One prefix per environment, so a staging cookie sent to production (or the reverse, when both
 * share a parent domain) is simply not a session cookie there.
 */
export function cookiePrefixFor(appEnv: ApiEnv['APP_ENV']): string {
  return appEnv === 'production' ? 'radd' : `radd-${appEnv}`;
}

/** `BETTER_AUTH_URL` split into Better Auth's `baseURL` (origin) and `basePath`. */
export function authUrlParts(betterAuthUrl: string): { origin: string; basePath: string } {
  const url = new URL(betterAuthUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  return { origin: url.origin, basePath: basePath === '' ? '/' : basePath };
}

/** Cookies on the parent domain everywhere but `localhost`, where browsers refuse a Domain. */
export function crossSubDomainCookieDomain(cookieDomain: string): string | undefined {
  const domain = cookieDomain.trim().toLowerCase();
  return domain === '' || domain === 'localhost' ? undefined : domain;
}

/**
 * The resolved client IP in the form Better Auth accepts. `resolveClientIp` writes an IPv6
 * address as its /64 network (`2001:db8::/64`); Better Auth wants a bare address and masks to
 * /64 itself, so the suffix is dropped.
 */
export function toAuthClientIp(clientIp: string | undefined): string | undefined {
  if (!clientIp) return undefined;
  const slash = clientIp.indexOf('/');
  return slash === -1 ? clientIp : clientIp.slice(0, slash);
}

/** ID-shaped keys whose values are not ours and are never UUIDs (OAuth provider and account IDs). */
const FOREIGN_ID_KEYS: ReadonlySet<string> = new Set(['providerId', 'accountId', 'clientId']);
const MAX_ID_SCAN_DEPTH = 4;

function isIdKey(key: string): boolean {
  return (key === 'id' || key.endsWith('Id')) && !FOREIGN_ID_KEYS.has(key);
}

/**
 * The first `id`-like key (`id`, `organizationId`, …) whose value is a string but not a UUID, or
 * undefined. Every one of our auth IDs is a UUID column, and Postgres answers a malformed one
 * with an error that would otherwise surface as a 500. `null` is left alone: Better Auth uses it
 * to clear a value, e.g. the active organisation.
 */
export function findMalformedId(input: unknown, depth = 0): string | undefined {
  if (depth > MAX_ID_SCAN_DEPTH || input === null || typeof input !== 'object') return undefined;
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findMalformedId(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  for (const [key, value] of Object.entries(input)) {
    if (isIdKey(key) && typeof value === 'string' && !isUuid(value)) return key;
    const found = findMalformedId(value, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** The console page that answers an invitation (`/accept-invitation/<id>`). */
export function invitationUrl(consolePublicUrl: string, invitationId: string): string {
  const base = consolePublicUrl.endsWith('/') ? consolePublicUrl : `${consolePublicUrl}/`;
  return new URL(`accept-invitation/${encodeURIComponent(invitationId)}`, base).toString();
}
