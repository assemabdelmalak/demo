import { createHmac } from 'node:crypto';

/**
 * The client IP as an audit row stores it: an HMAC keyed with `ACTOR_HASH_SECRET` (ADR-016,
 * ADR-017), so entries from one address can be grouped without the address being recoverable. A
 * bare hash would not do: the IPv4 space is small enough to reverse it by brute force. The label
 * keeps the value distinct from the rate limiter's key fragments, which use the same secret.
 */
export function auditIpHash(secret: string, clientIp: string): string {
  return createHmac('sha256', secret).update(`audit-ip:${clientIp}`).digest('base64url');
}

/**
 * Field names whose values never belong in an audit row (SECURITY §2 "Never log"): credentials,
 * codes, cookies, payment references and addresses. Matched without case or separators, so
 * `pin_hash`, `pinHash` and `PinHash` are all caught.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'pin',
  'pinhash',
  'token',
  'tokenhash',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'secret',
  'otp',
  'cookie',
  'setcookie',
  'reference',
  'externalreference',
  'paymentreference',
  'ip',
  'ipaddress',
  'clientip',
  'remoteaddress',
]);

export const REDACTED = '[redacted]';

function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z]/g, '');
  return SENSITIVE_KEYS.has(normalised) || normalised.endsWith('secret');
}

function scrub(value: unknown, clientIp: string | null): unknown {
  if (typeof value === 'string') return clientIp !== null && value === clientIp ? REDACTED : value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, clientIp));
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? REDACTED : scrub(item, clientIp),
      ]),
    );
  }
  return value;
}

/**
 * The `before` / `after` state as stored. Services choose what they pass, and must never pass a
 * secret; this is the backstop. Sensitive fields are replaced by `[redacted]` (so the entry
 * still shows the field changed), and a string equal to the request's client IP is replaced
 * too. Nested objects and arrays are walked; dates become ISO strings.
 */
export function sanitizeAuditState(
  state: Record<string, unknown> | null | undefined,
  clientIp: string | null,
): Record<string, unknown> | null {
  if (state === null || state === undefined) return null;
  return scrub(state, clientIp) as Record<string, unknown>;
}
