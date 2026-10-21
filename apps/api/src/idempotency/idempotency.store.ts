import { randomUUID } from 'node:crypto';

import { type Redis } from 'ioredis';

import { type ProblemDetails } from '@radd/shared';

export interface IdempotencyOptions {
  /** How long a completed response is replayed (API §1). */
  ttlMs: number;
  /** Lifetime of the in-flight marker between heartbeats; it lapses on its own if the process dies. */
  inFlightTtlMs: number;
  /** Upper bound on how long a single request may keep the key locked through heartbeats. */
  maxHoldMs: number;
}

export const DEFAULT_IDEMPOTENCY_OPTIONS: IdempotencyOptions = {
  ttlMs: 24 * 60 * 60 * 1000,
  inFlightTtlMs: 60 * 1000,
  maxHoldMs: 15 * 60 * 1000,
};

export interface InFlightRecord {
  state: 'in_flight';
  fingerprint: string;
  token: string;
}

export interface CompletedRecord {
  state: 'completed';
  fingerprint: string;
  status: number;
  headers?: Record<string, string>;
  body: unknown;
  problem?: boolean;
}

export type StoredRecord = InFlightRecord | CompletedRecord;
export type StoredProblem = CompletedRecord & { problem: true; body: ProblemDetails };

export type ClaimResult =
  { claimed: true; token: string } | { claimed: false; existing: StoredRecord };

/**
 * Compare-and-set on the in-flight marker: only the request holding `token` may refresh, store or
 * release it. Without this, a request that outlived its marker could overwrite or delete the
 * record of a retry that legitimately claimed the key after it.
 */
const OWNED_OP_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local ok, record = pcall(cjson.decode, current)
if not ok or record.state ~= 'in_flight' or record.token ~= ARGV[1] then return 0 end
local op = ARGV[2]
if op == 'refresh' then
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
elseif op == 'release' then
  redis.call('DEL', KEYS[1])
else
  redis.call('SET', KEYS[1], ARGV[4], 'PX', ARGV[3])
end
return 1
`;

export class IdempotencyStore {
  constructor(
    private readonly valkey: Redis,
    readonly options: IdempotencyOptions = DEFAULT_IDEMPOTENCY_OPTIONS,
  ) {}

  /** Atomically claims the key, or returns the record of whoever got there first. */
  async claim(key: string, fingerprint: string): Promise<ClaimResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = randomUUID();
      const marker: InFlightRecord = { state: 'in_flight', fingerprint, token };
      const set = await this.valkey.set(
        key,
        JSON.stringify(marker),
        'PX',
        this.options.inFlightTtlMs,
        'NX',
      );
      if (set === 'OK') return { claimed: true, token };
      const raw = await this.valkey.get(key);
      // Expired between SET and GET: try again rather than guess.
      if (raw !== null) return { claimed: false, existing: JSON.parse(raw) as StoredRecord };
    }
    throw new Error('idempotency key kept expiring while being claimed');
  }

  /** Extends the marker while the request is still running. */
  refresh(key: string, token: string): Promise<boolean> {
    return this.owned(key, token, 'refresh', this.options.inFlightTtlMs);
  }

  complete(key: string, token: string, record: CompletedRecord): Promise<boolean> {
    return this.owned(key, token, 'complete', this.options.ttlMs, JSON.stringify(record));
  }

  /** Drops the marker so a retry runs the request again (5xx and other non-replayable outcomes). */
  release(key: string, token: string): Promise<boolean> {
    return this.owned(key, token, 'release', 0);
  }

  private async owned(
    key: string,
    token: string,
    op: string,
    ttlMs: number,
    value = '',
  ): Promise<boolean> {
    const result = await this.valkey.eval(OWNED_OP_LUA, 1, key, token, op, ttlMs, value);
    return result === 1;
  }
}
