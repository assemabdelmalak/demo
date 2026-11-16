import { createHmac, hkdfSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  derivePinPepper,
  hashPassword,
  hashPin,
  PIN_PEPPER_INFO,
  verifyPassword,
  verifyPin,
} from './crypto.js';

describe('password hashing', () => {
  it('produces argon2id hashes with the documented parameters', async () => {
    const hashed = await hashPassword('correct horse battery staple');
    expect(hashed).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same password!'),
      hashPassword('same password!'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hashed = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hashed, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hashed, 'correct horse battery stapl')).toBe(false);
  });

  it('treats malformed or foreign hashes as a failed check', async () => {
    expect(await verifyPassword('', 'anything')).toBe(false);
    expect(await verifyPassword('$argon2id$garbage', 'anything')).toBe(false);
    // Better Auth's default scrypt format must not be accepted by accident.
    expect(await verifyPassword('abcdef:0123456789', 'anything')).toBe(false);
  });
});

describe('PIN hashing (ADR-026)', () => {
  const secret = 'a-better-auth-secret-of-enough-length';
  const pepper = derivePinPepper(secret);

  it('derives a 32-byte pepper with HKDF-SHA256 under the fixed label, never the secret itself', () => {
    expect(PIN_PEPPER_INFO).toBe('radd-menu/staff-pin-pepper/v1');
    expect(pepper).toHaveLength(32);
    expect(pepper).toEqual(
      Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), PIN_PEPPER_INFO, 32)),
    );
    expect(pepper.toString('utf8')).not.toContain(secret);
    expect(derivePinPepper(`${secret}!`)).not.toEqual(pepper);
    expect(() => derivePinPepper('')).toThrow(TypeError);
  });

  it('hashes the peppered PIN with argon2id, so the bare PIN does not verify against it', async () => {
    const stored = await hashPin('2580', pepper);
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPin(stored, '2580', pepper)).toBe(true);
    expect(await verifyPin(stored, '2581', pepper)).toBe(false);
    // An offline search over PINs without the pepper finds nothing.
    expect(await verifyPassword(stored, '2580')).toBe(false);
    const peppered = createHmac('sha256', pepper).update('2580').digest('base64url');
    expect(await verifyPassword(stored, peppered)).toBe(true);
  });

  it('fails the check under another pepper and on a malformed hash', async () => {
    const stored = await hashPin('2580', pepper);
    expect(await verifyPin(stored, '2580', derivePinPepper('another secret'))).toBe(false);
    expect(await verifyPin('', '2580', pepper)).toBe(false);
    expect(await verifyPin('$argon2id$garbage', '2580', pepper)).toBe(false);
  });
});
