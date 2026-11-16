import { createHmac, hkdfSync } from 'node:crypto';

import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id with the OWASP Password Storage Cheat Sheet minimum (19 MiB, 2 passes, 1 lane). The
 * parameters are written into every hash, so raising them later only affects new hashes and old
 * ones keep verifying. The algorithm is the library's default, argon2id: its `Algorithm` is an
 * ambient const enum that isolated modules cannot reference. The unit test pins the `$argon2id$`
 * prefix, so a change of default would fail CI.
 */
export const ARGON2ID_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** PHC string, e.g. `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`, with a random salt. */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2ID_OPTIONS);
}

/**
 * Constant-time check of `plain` against a stored PHC string. A malformed or foreign hash is a
 * failed check, never an exception, so a corrupt row cannot turn a sign-in into a 500.
 */
export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  if (!stored.startsWith('$argon2')) return false;
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}

// ── Staff quick-switch PINs (ADR-026) ───────────────────────────────────────────────────────

/**
 * Fixed HKDF label of the PIN pepper. Changing it invalidates every stored PIN, so it carries a
 * version and is never edited; a new scheme would get a new label and a migration path.
 */
export const PIN_PEPPER_INFO = 'radd-menu/staff-pin-pepper/v1';

/**
 * The server-side pepper for PIN hashes: HKDF-SHA256 of `BETTER_AUTH_SECRET` under a fixed label,
 * so it never has to be configured separately and is never the secret itself. A 4–6 digit PIN
 * has at most a million values; without the pepper a leaked `pin_hash` falls to an offline search
 * in seconds even under argon2id. With it the search also needs the server's secret.
 */
export function derivePinPepper(secret: string): Buffer {
  if (secret.length === 0) throw new TypeError('derivePinPepper needs a secret');
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), PIN_PEPPER_INFO, 32));
}

/** HMAC-SHA256 of the PIN under the pepper: what argon2id actually hashes. */
function pepperedPin(pin: string, pepper: Buffer): string {
  return createHmac('sha256', pepper).update(pin, 'utf8').digest('base64url');
}

/** PHC string of a PIN, argon2id over its peppered HMAC with a random salt. */
export function hashPin(pin: string, pepper: Buffer): Promise<string> {
  return hashPassword(pepperedPin(pin, pepper));
}

/** Constant-time check of a PIN against a stored PIN hash; a malformed hash is a failed check. */
export function verifyPin(stored: string, pin: string, pepper: Buffer): Promise<boolean> {
  return verifyPassword(stored, pepperedPin(pin, pepper));
}
