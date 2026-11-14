import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './crypto.js';

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
