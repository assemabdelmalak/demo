import { createHash } from 'node:crypto';

import { type Redis } from 'ioredis';

/** Limits of the PIN switch (ADR-026). Tests shorten the windows; production uses the defaults. */
export interface PinLockoutOptions {
  /** Consecutive failures before the lock. */
  maxFailures: number;
  /** How long the lock lasts. */
  lockMs: number;
  /** How long consecutive failures are remembered without another attempt. */
  failureWindowMs: number;
  /** Failures in `dayMs` after which the PIN is disabled until a manager sets a new one. */
  maxDailyFailures: number;
  dayMs: number;
  /** Switch attempts per device in `rateWindowMs`, whoever they are for. */
  ratePerDevice: number;
  rateWindowMs: number;
}

export const DEFAULT_PIN_LOCKOUT: PinLockoutOptions = {
  maxFailures: 5,
  lockMs: 5 * 60 * 1000,
  failureWindowMs: 15 * 60 * 1000,
  maxDailyFailures: 15,
  dayMs: 24 * 60 * 60 * 1000,
  ratePerDevice: 30,
  rateWindowMs: 60 * 1000,
};

/** The outcome of counting an attempt, before the PIN is verified. */
export type PinAttempt =
  | { kind: 'proceed'; failures: number; dailyFailures: number }
  | { kind: 'locked'; retryAfterMs: number }
  | { kind: 'disabled' }
  | { kind: 'rate_limited'; retryAfterMs: number };

/**
 * What a failed attempt leads to, given the counts after it was counted (pure, unit-tested):
 * the 5th consecutive failure locks the PIN for 5 minutes, the 15th of the day disables it.
 */
export function failureOutcome(
  failures: number,
  dailyFailures: number,
  options: Pick<PinLockoutOptions, 'maxFailures' | 'maxDailyFailures'>,
): { lock: boolean; disable: boolean } {
  return {
    lock: failures >= options.maxFailures,
    disable: dailyFailures >= options.maxDailyFailures,
  };
}

/** Whole seconds for `Retry-After`, never 0. */
export function retryAfterSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * A short fingerprint of the member's current PIN hash, part of every counter key. Setting a new
 * PIN changes it, so a manager's reset clears the lock and the day's count at once.
 */
export function pinGeneration(pinHash: string | null | undefined): string {
  if (!pinHash) return 'none';
  return createHash('sha256').update(pinHash).digest('base64url').slice(0, 16);
}

export interface PinAttemptKey {
  deviceId: string;
  memberId: string;
  generation: string;
}

function keys(key: PinAttemptKey): { rate: string; failures: string; lock: string; day: string } {
  const base = `pin:${key.deviceId}:${key.memberId}:${key.generation}`;
  return {
    rate: `pin:${key.deviceId}:rate`,
    failures: `${base}:fails`,
    lock: `${base}:lock`,
    day: `${base}:day`,
  };
}

/**
 * Counts an attempt before the PIN is checked, atomically, so parallel guesses cannot slip past
 * the limit: the attempt over the limit is refused, not verified.
 *
 * KEYS: rate, failures, lock, day. ARGV: ratePerDevice, rateWindowMs, maxFailures,
 * failureWindowMs, maxDailyFailures, dayMs, lockMs, count (1 = count towards the PIN's limits).
 * Returns { 0, failures, day } to proceed, { 1, ttl } locked, { 2, ttl } disabled, { 3, ttl }
 * rate limited.
 */
const BEGIN_LUA = `
-- radd-pin-lockout
local rate = redis.call('INCR', KEYS[1])
if rate == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
if rate > tonumber(ARGV[1]) then
  return { 3, redis.call('PTTL', KEYS[1]) }
end
if ARGV[8] ~= '1' then return { 0, 0, 0 } end
local lock = redis.call('PTTL', KEYS[3])
if lock > 0 then return { 1, lock } end
local day = tonumber(redis.call('GET', KEYS[4]) or '0')
if day >= tonumber(ARGV[5]) then return { 2, redis.call('PTTL', KEYS[4]) } end
local failures = redis.call('INCR', KEYS[2])
if failures == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[4]) end
if failures > tonumber(ARGV[3]) then
  redis.call('SET', KEYS[3], '1', 'PX', ARGV[7])
  redis.call('DEL', KEYS[2])
  return { 1, tonumber(ARGV[7]) }
end
day = redis.call('INCR', KEYS[4])
if day == 1 then redis.call('PEXPIRE', KEYS[4], ARGV[6]) end
return { 0, failures, day }
`;

/** Undoes the count of an attempt that turned out right: the consecutive run ends there. */
const SUCCEED_LUA = `
-- radd-pin-lockout
redis.call('DEL', KEYS[1])
local day = tonumber(redis.call('GET', KEYS[2]) or '0')
if day > 0 then redis.call('DECR', KEYS[2]) end
return 0
`;

export class PinLockoutUnavailableError extends Error {
  constructor(cause: unknown) {
    super('PIN lockout store unavailable', { cause });
    this.name = 'PinLockoutUnavailableError';
  }
}

/**
 * Failure counters for the PIN switch in Valkey (ADR-026). Every call that cannot reach Valkey
 * throws `PinLockoutUnavailableError`: the switch fails closed, since an unlimited PIN guess is
 * worse than a tablet that cannot switch for a minute.
 */
export class PinLockout {
  constructor(
    private readonly valkey: Redis,
    readonly options: PinLockoutOptions,
  ) {}

  /** Counts the attempt (`count: false` only rate-limits, for a request without a valid device). */
  async begin(key: PinAttemptKey, count: boolean): Promise<PinAttempt> {
    const k = keys(key);
    const o = this.options;
    let result: unknown;
    try {
      result = await this.valkey.eval(
        BEGIN_LUA,
        4,
        k.rate,
        k.failures,
        k.lock,
        k.day,
        o.ratePerDevice,
        o.rateWindowMs,
        o.maxFailures,
        o.failureWindowMs,
        o.maxDailyFailures,
        o.dayMs,
        o.lockMs,
        count ? '1' : '0',
      );
    } catch (error) {
      throw new PinLockoutUnavailableError(error);
    }
    const [status, a, b] = Array.isArray(result) ? (result as unknown[]).map(Number) : [];
    switch (status) {
      case 0:
        return { kind: 'proceed', failures: a ?? 0, dailyFailures: b ?? 0 };
      case 1:
        return { kind: 'locked', retryAfterMs: Math.max(a ?? o.lockMs, 1) };
      case 2:
        return { kind: 'disabled' };
      case 3:
        return { kind: 'rate_limited', retryAfterMs: Math.max(a ?? o.rateWindowMs, 1) };
      default:
        throw new PinLockoutUnavailableError(new Error('unexpected lockout reply'));
    }
  }

  /** After a wrong PIN: locks once the run reaches the limit. Says whether to disable the PIN. */
  async fail(
    key: PinAttemptKey,
    attempt: { failures: number; dailyFailures: number },
  ): Promise<{ lock: boolean; disable: boolean }> {
    const outcome = failureOutcome(attempt.failures, attempt.dailyFailures, this.options);
    if (outcome.lock) {
      const k = keys(key);
      try {
        await this.valkey
          .multi()
          .set(k.lock, '1', 'PX', this.options.lockMs)
          .del(k.failures)
          .exec();
      } catch (error) {
        throw new PinLockoutUnavailableError(error);
      }
    }
    return outcome;
  }

  async succeed(key: PinAttemptKey): Promise<void> {
    const k = keys(key);
    try {
      await this.valkey.eval(SUCCEED_LUA, 2, k.failures, k.day);
    } catch (error) {
      throw new PinLockoutUnavailableError(error);
    }
  }
}
