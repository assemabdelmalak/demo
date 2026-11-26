import { createHmac } from 'node:crypto';

import { type LoggerService } from '@nestjs/common';
import { type Redis } from 'ioredis';

/** Better Auth's `rateLimit.customStorage` contract (`BetterAuthRateLimitStorage`). */
export interface AuthRateLimitStorage {
  consume(
    key: string,
    rule: { window: number; max: number },
  ): Promise<{ allowed: boolean; retryAfter: number | null }>;
}

/**
 * Fixed window in one round trip: count the request, start the window on the first one, and
 * report how long it has left. Atomic, so concurrent requests on several API instances cannot all
 * pass a stale read. A key without a TTL (only possible after a crash between the two calls in a
 * non-atomic version) is given one, so it can never block forever.
 *
 * Returns { count, msUntilReset }.
 */
const CONSUME_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

const KEY_PREFIX = 'auth-rl:';

/**
 * Better Auth keys its limiter by client IP and path. The key is HMAC'd before it reaches Valkey
 * so a key dump or backup holds no IP addresses (ADR-016).
 */
export function hashedLimitKey(key: string, secret: string): string {
  return `${KEY_PREFIX}${createHmac('sha256', secret).update(key).digest('base64url')}`;
}

/**
 * Valkey-backed limiter for sign-in, sign-up and code endpoints. Unlike the general API throttler
 * it fails closed: if Valkey cannot be reached, auth requests are refused (429) rather than let an
 * attacker guess passwords and codes without a limit while Valkey is down.
 */
export function createValkeyRateLimitStorage(
  valkey: Redis,
  secret: string,
  logger: LoggerService,
): AuthRateLimitStorage {
  return {
    async consume(key, rule) {
      const windowMs = Math.max(1, Math.round(rule.window * 1000));
      try {
        const result = (await valkey.eval(
          CONSUME_LUA,
          1,
          hashedLimitKey(key, secret),
          String(windowMs),
        )) as [number, number];
        const [count, msUntilReset] = result;
        if (count <= rule.max) return { allowed: true, retryAfter: null };
        return { allowed: false, retryAfter: Math.max(1, Math.ceil(msUntilReset / 1000)) };
      } catch (error) {
        logger.warn(
          { err: error instanceof Error ? { name: error.name, message: error.message } : error },
          'auth rate limiter unavailable; refusing the request',
        );
        return { allowed: false, retryAfter: rule.window };
      }
    },
  };
}
