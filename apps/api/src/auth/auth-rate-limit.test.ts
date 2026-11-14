import { type LoggerService } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { createValkeyRateLimitStorage, hashedLimitKey } from './auth-rate-limit';

const logger = () => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn() }) satisfies LoggerService;

/** A Valkey stand-in that answers the consume script from a counter. */
function fakeValkey(seen: string[] = []): Redis {
  const counts = new Map<string, number>();
  return {
    eval: vi.fn((_script: string, _numKeys: number, key: string) => {
      seen.push(key);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return Promise.resolve([next, 4_200]);
    }),
  } as unknown as Redis;
}

describe('Valkey auth rate limit storage', () => {
  it('allows up to max and then reports the time left in seconds', async () => {
    const storage = createValkeyRateLimitStorage(fakeValkey(), 'secret', logger());
    const rule = { window: 10, max: 2 };
    expect(await storage.consume('10.0.0.1|/sign-in/email', rule)).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect((await storage.consume('10.0.0.1|/sign-in/email', rule)).allowed).toBe(true);
    expect(await storage.consume('10.0.0.1|/sign-in/email', rule)).toEqual({
      allowed: false,
      retryAfter: 5,
    });
  });

  it('never puts the raw key (an IP) into Valkey', async () => {
    const seen: string[] = [];
    const storage = createValkeyRateLimitStorage(fakeValkey(seen), 'secret', logger());
    await storage.consume('203.0.113.9|/sign-in/email', { window: 10, max: 3 });
    expect(seen).toEqual([hashedLimitKey('203.0.113.9|/sign-in/email', 'secret')]);
    expect(seen[0]).not.toContain('203.0.113.9');
    expect(hashedLimitKey('a', 'secret')).not.toBe(hashedLimitKey('a', 'other secret'));
  });

  it('fails closed and logs when Valkey is unreachable', async () => {
    const log = logger();
    const broken = {
      eval: vi.fn(() => Promise.reject(new Error('Connection is closed.'))),
    } as unknown as Redis;
    const storage = createValkeyRateLimitStorage(broken, 'secret', log);
    expect(await storage.consume('10.0.0.1|/sign-in/email', { window: 10, max: 3 })).toEqual({
      allowed: false,
      retryAfter: 10,
    });
    expect(log.warn).toHaveBeenCalledOnce();
  });
});
