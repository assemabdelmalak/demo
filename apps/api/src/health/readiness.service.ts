import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { Pool } from 'pg';

import { type HealthReady } from './health.dto';
import { API_ENV, type ApiEnv } from '../config/env.module';
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
export class ReadinessService implements OnApplicationShutdown {
  private readonly logger = new Logger(ReadinessService.name);
  // A one-connection pool just for probes; P1-T01 replaces it with the shared db package pool.
  private readonly pool: Pool;

  constructor(
    @Inject(API_ENV) env: ApiEnv,
    @Inject(VALKEY) private readonly valkey: Redis,
    private readonly queues: QueueProducer,
  ) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: CHECK_TIMEOUT_MS,
      idleTimeoutMillis: 30_000,
      application_name: 'radd-api-health',
    });
    // An idle client error must not crash the process; the next check reports it.
    this.pool.on('error', (error) => {
      this.logger.warn({ err: error }, 'health pool client error');
    });
  }

  async check(): Promise<HealthReady> {
    const [database, valkey, queue] = await Promise.all([
      this.run('database', async () => {
        await this.pool.query('select 1');
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

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }
}
