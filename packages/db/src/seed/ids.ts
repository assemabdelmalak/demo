import { createHash, createHmac, hkdfSync } from 'node:crypto';

/**
 * Deterministic IDs and secrets for the demo seed (TESTING §4: "a seeded UUIDv7 generator so
 * tests can reference known IDs"). Every seeded row gets the same ID in every environment, so
 * running the seed twice upserts instead of duplicating, and tests can name rows directly.
 */

/** Seeded IDs carry this time in their UUIDv7 timestamp; seeded confirmations carry it too. */
export const SEED_EPOCH = new Date('2026-01-01T09:00:00.000Z');

const NAMESPACE = 'radd-menu/seed/beit-tayta';

/**
 * A UUIDv7-shaped ID derived from `kind` and `key`: the 48-bit timestamp is `SEED_EPOCH`, the 74
 * "random" bits come from SHA-256, and the version and variant bits are set as RFC 9562 asks. It
 * validates everywhere a real UUIDv7 does.
 */
export function seedId(kind: string, key: string): string {
  const digest = createHash('sha256').update(`${NAMESPACE}/${kind}/${key}`).digest();
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(SEED_EPOCH.getTime(), 0, 6);
  digest.copy(bytes, 6, 0, 10);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * A table's QR token: 12 base58 characters (~70 bits, SECURITY T2) from an HMAC keyed with the
 * environment's `BETTER_AUTH_SECRET`. Stable for one environment, unguessable without its secret,
 * so a staging demo's tables cannot be joined by anyone who has read this repository.
 */
export function seedQrToken(secret: string, tableKey: string): string {
  const digest = createHmac('sha256', secret)
    .update(`${NAMESPACE}/qr-token/v1/${tableKey}`)
    .digest();
  return Array.from(digest.subarray(0, 12), (byte) => BASE58[byte % BASE58.length]).join('');
}

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * The super admin's TOTP secret, in the shape Better Auth generates (32 alphanumeric characters,
 * used as UTF-8 bytes by its TOTP code). Derived from `BETTER_AUTH_SECRET`, so one environment
 * always prints the same authenticator seed and re-seeding never locks the admin out.
 */
export function seedTotpSecret(secret: string): string {
  const bytes = Buffer.from(
    hkdfSync('sha256', secret, Buffer.alloc(0), `${NAMESPACE}/totp/v1`, 32),
  );
  return Array.from(bytes, (byte) => ALPHANUMERIC[byte % ALPHANUMERIC.length]).join('');
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding: how authenticator apps receive a TOTP secret. */
export function base32Encode(input: string): string {
  let bits = '';
  for (const byte of Buffer.from(input, 'utf8')) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32.charAt(Number.parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2));
  }
  return out;
}
