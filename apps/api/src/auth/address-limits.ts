import { type LoggerService } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { hashedLimitKey } from './auth-rate-limit';

/**
 * Limits keyed by the email address a request names, on top of Better Auth's per-IP limits
 * (ADR-034). Per-IP limits alone let anyone with many addresses (one IPv6 /48 is 65 536 /64
 * buckets) send one inbox unlimited codes and guess one account's password without slowing down
 * (security review of Phase 1, M1 and M2). Both apply the same way to addresses with and without
 * an account, so neither says whether an account exists.
 */

/** Emailed codes per address: 5 an hour, whichever code-request path and client IP. */
export const ADDRESS_CODE_LIMIT = { window: 60 * 60, max: 5 } as const;

/** Wrong passwords per address: the 10th within 15 minutes pauses sign-in for 15 minutes. */
export const SIGN_IN_LOCKOUT = {
  failures: 10,
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
} as const;

export const SIGN_IN_PATH = '/sign-in/email';

/**
 * The address a request body names, as Better Auth compares it (lower-cased), trimmed so that
 * spacing cannot open a second bucket. Undefined when the body names none.
 */
export function requestAddress(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const value: unknown = (body as Record<string, unknown>).email;
  if (typeof value !== 'string') return undefined;
  const address = value.trim().toLowerCase();
  return address === '' ? undefined : address;
}

/**
 * Counts a failure, and on the last allowed one starts the pause and clears the count, in one
 * round trip so that concurrent failures on several API instances cannot skip the pause.
 * KEYS: lock, failures. ARGV: failure window ms, failures allowed, pause ms.
 */
const RECORD_FAILURE_LUA = `
local count = redis.call('INCR', KEYS[2])
if count == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[1]) end
if count >= tonumber(ARGV[2]) then
  redis.call('SET', KEYS[1], '1', 'PX', ARGV[3])
  redis.call('DEL', KEYS[2])
  return 1
end
return 0
`;

export interface SignInLockoutVerdict {
  locked: boolean;
  /** Seconds until the pause ends, when locked. */
  retryAfter: number | null;
}

/**
 * The per-address pause on password sign-in. Keys are HMAC'd like the auth limiter's, so Valkey
 * never holds an address. Fails closed like the auth limiter: without Valkey, password sign-in is
 * refused rather than left without a limit.
 */
export class SignInLockout {
  constructor(
    private readonly valkey: Redis,
    private readonly secret: string,
    private readonly logger: LoggerService,
  ) {}

  private keys(address: string): [lock: string, failures: string] {
    return [
      hashedLimitKey(`signin-lock|${address}`, this.secret),
      hashedLimitKey(`signin-failures|${address}`, this.secret),
    ];
  }

  async check(address: string): Promise<SignInLockoutVerdict> {
    const [lock] = this.keys(address);
    try {
      const ms = await this.valkey.pttl(lock);
      if (ms > 0) return { locked: true, retryAfter: Math.max(1, Math.ceil(ms / 1000)) };
      return { locked: false, retryAfter: null };
    } catch (error) {
      this.warn(error, 'sign-in lockout unavailable; refusing the request');
      return { locked: true, retryAfter: Math.ceil(SIGN_IN_LOCKOUT.lockMs / 1000) };
    }
  }

  /**
   * Better Auth's answer to the sign-in: 401 is a wrong password (or no such account; counted
   * the same); 200 is a correct one, which clears the count. Anything else (validation, an
   * unverified address, the per-IP limit) is not a guess and changes nothing.
   */
  async record(address: string, status: number): Promise<void> {
    const [lock, failures] = this.keys(address);
    try {
      if (status === 401) {
        await this.valkey.eval(
          RECORD_FAILURE_LUA,
          2,
          lock,
          failures,
          String(SIGN_IN_LOCKOUT.windowMs),
          String(SIGN_IN_LOCKOUT.failures),
          String(SIGN_IN_LOCKOUT.lockMs),
        );
      } else if (status === 200) {
        await this.valkey.del(failures);
      }
    } catch (error) {
      this.warn(error, 'could not record a sign-in attempt');
    }
  }

  private warn(error: unknown, message: string): void {
    this.logger.warn(
      { err: error instanceof Error ? { name: error.name, message: error.message } : error },
      message,
    );
  }
}
