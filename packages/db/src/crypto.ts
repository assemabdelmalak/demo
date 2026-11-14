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
