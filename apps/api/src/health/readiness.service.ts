import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { type DbHandle } from '@radd/db';

import { type HealthReady } from './health.dto';
import { DB } from '../db/db.module';
import { QueueProducer } from '../queues/queue-producer';
import { VALKEY } from '../valkey/valkey.module';

const CHECK_TIMEOUT_MS = 1_500;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} check timed out after ${String(CHECK_TIMEOUT_MS)} ms`));
      }, CHECK_TIMEOUT_MS).unref();
    }),
  ]);
}

/**
 * Readiness = the API can serve traffic: Postgres, Valkey and the BullMQ connection answer.
 * The worker is deliberately not checked; a dead worker must not take the API out of rotation,
 * because browsing and ordering do not depend on it (CLAUDE §3.4 spirit).
 */
@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    // The pool requests use: a probe that passes on a private connection would hide an exhausted pool.
    @Inject(DB) private readonly database: DbHandle,
    @Inject(VALKEY) private readonly valkey: Redis,
    private readonly queues: QueueProducer,
  ) {}

  async check(): Promise<HealthReady> {
    const [database, valkey, queue] = await Promise.all([
      this.run('database', async () => {
        await this.database.pool.query('select 1');
      }),
      this.run('valkey', async () => {
        await this.valkey.ping();
      }),
      this.run('queue', async () => {
        // A real BullMQ round trip, not just a socket ping.
        await this.queues.queue('noop').getJobCounts('waiting');
      }),
    ]);
    const healthy = database === 'ok' && valkey === 'ok' && queue === 'ok';
    return { status: healthy ? 'ok' : 'error', checks: { database, valkey, queue } };
  }

  private async run(label: string, probe: () => Promise<void>): Promise<'ok' | 'error'> {
    try {
      await withTimeout(probe(), label);
      return 'ok';
    } catch (error) {
      this.logger.warn({ err: error, check: label }, 'readiness check failed');
      return 'error';
    }
  }
}
