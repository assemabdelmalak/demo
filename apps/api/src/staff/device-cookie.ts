import { createHash, randomBytes } from 'node:crypto';

/** A year: a shared tablet stays registered until a manager revokes it. */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** 32 random bytes, base64url without padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface DeviceCookieSpec {
  name: string;
  path: string;
  secure: boolean;
}

/**
 * The staff device cookie (ADR-026). Host-only (no `Domain`), so only the API host ever receives
 * it: not the diner site, the console, the CDN or staging.
 *
 * Over HTTPS it is `__Host-radd_device`. Browsers accept a `__Host-` cookie only when it is
 * Secure, host-only and has `Path=/`, so it cannot be narrowed to `/v1`; the prefix is worth more
 * than the path, because it stops a sibling subdomain or a plain-HTTP response from planting or
 * overwriting the cookie. Over plain HTTP (local development) the prefix is impossible, so it is
 * `radd_device` with `Path=/v1`.
 */
export function deviceCookieSpec(apiUrl: string): DeviceCookieSpec {
  const secure = new URL(apiUrl).protocol === 'https:';
  return secure
    ? { name: '__Host-radd_device', path: '/', secure }
    : { name: 'radd_device', path: '/v1', secure };
}

/** `Set-Cookie` value that stores the device token. */
export function serializeDeviceCookie(spec: DeviceCookieSpec, token: string): string {
  const parts = [
    `${spec.name}=${token}`,
    `Path=${spec.path}`,
    `Max-Age=${String(DEVICE_COOKIE_MAX_AGE_SECONDS)}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (spec.secure) parts.push('Secure');
  return parts.join('; ');
}

/** A fresh device token: 32 random bytes. Shown to the browser once, in the cookie only. */
export function newDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database stores: SHA-256 of the token, hex. The token itself is never stored. */
export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * The device token from a `Cookie` header, if it carries a well-formed one. Anything else is
 * treated as no cookie at all.
 */
export function readDeviceToken(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    const value = trimmed.slice(name.length + 1);
    return TOKEN_PATTERN.test(value) ? value : undefined;
  }
  return undefined;
}
