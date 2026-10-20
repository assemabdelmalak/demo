import { hostname } from 'node:os';

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Redis } from 'ioredis';

import { QUEUE_PREFIX } from '@radd/shared';

import { WORKER_VALKEY } from '../valkey';

export const HEARTBEAT_INTERVAL_MS = 10_000;
/** A heartbeat older than this means the worker cannot reach Valkey, so it cannot process jobs. */
export const HEARTBEAT_STALE_MS = 30_000;

/**
 * Writes `radd:worker:heartbeat:<host>` every 10 s (expires after 30 s) so operators and the probe
 * can tell a live worker from a hung one.
 */
@Injectable()
export class HeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HeartbeatService.name);
  private timer: NodeJS.Timeout | undefined;
  private lastBeatAt: number | undefined;
  readonly key = `${QUEUE_PREFIX}:worker:heartbeat:${hostname()}`;

  constructor(@Inject(WORKER_VALKEY) private readonly valkey: Redis) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.beat();
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async beat(): Promise<void> {
    try {
      await this.valkey.set(this.key, new Date().toISOString(), 'PX', HEARTBEAT_STALE_MS);
      this.lastBeatAt = Date.now();
    } catch (error) {
      this.logger.warn({ err: error }, 'heartbeat failed');
    }
  }

  isHealthy(now = Date.now()): boolean {
    return this.lastBeatAt !== undefined && now - this.lastBeatAt < HEARTBEAT_STALE_MS;
  }

  get lastBeat(): string | undefined {
    return this.lastBeatAt === undefined ? undefined : new Date(this.lastBeatAt).toISOString();
  }
}
