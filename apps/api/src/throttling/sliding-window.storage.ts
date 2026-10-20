import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { type ThrottlerStorage } from '@nestjs/throttler';
import { type Redis } from 'ioredis';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Sliding-window log in a sorted set: a request is allowed when fewer than `limit` requests were
 * accepted in the last `ttl` ms. Rejected requests are not recorded, so a client that backs off is
 * let back in as soon as its oldest request leaves the window (API §8). Valkey's clock is used so
 * every API instance agrees on "now".
 *
 * Returns { hits, msUntilReset, blocked (0|1), msUntilAllowed }.
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - ttl)
local count = redis.call('ZCARD', key)
if count >= limit then
  -- limit 0 (an endpoint switched off) leaves the set empty: wait a full window.
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local wait = ttl
  if oldest[2] then wait = tonumber(oldest[2]) + ttl - now end
  return { count + 1, wait, 1, wait }
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, ttl)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
return { count + 1, tonumber(oldest[2]) + ttl - now, 0, 0 }
`;

const toSeconds = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

export class SlidingWindowThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(SlidingWindowThrottlerStorage.name);

  constructor(
    private readonly valkey: Redis,
    private readonly prefix = 'rl:',
  ) {}

  /**
   * `blockDuration` is ignored on purpose: a fixed penalty box would turn the sliding window into a
   * fixed one. If Valkey is unreachable the request is allowed (fail open) and a warning is logged:
   * losing rate limiting briefly is better than taking the menu down.
   */
  async increment(key: string, ttl: number, limit: number): Promise<ThrottlerStorageRecord> {
    try {
      const [totalHits, msUntilReset, blocked, msUntilAllowed] = (await this.valkey.eval(
        SLIDING_WINDOW_LUA,
        1,
        `${this.prefix}${key}`,
        ttl,
        limit,
        randomUUID(),
      )) as [number, number, number, number];
      return {
        totalHits,
        timeToExpire: toSeconds(msUntilReset),
        isBlocked: blocked === 1,
        timeToBlockExpire: toSeconds(msUntilAllowed),
      };
    } catch (error) {
      this.logger.warn({ err: error }, 'rate limiter unavailable; allowing request');
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
