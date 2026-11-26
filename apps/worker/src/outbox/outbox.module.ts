import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { RedisEmitterPublisher, type RealtimePublisher } from '@radd/shared/realtime-publisher';

import { OutboxDispatchProcessor } from './outbox-dispatch.processor';
import {
  DEFAULT_OUTBOX_DISPATCH,
  OUTBOX_DISPATCH_OPTIONS,
  type OutboxDispatchOptions,
  OutboxDispatcher,
  WORKER_REALTIME,
} from './outbox-dispatcher';
import { WORKER_ENV, type WorkerEnv } from '../config/env.module';

const WORKER_REALTIME_VALKEY = Symbol('WORKER_REALTIME_VALKEY');

export interface OutboxModuleOptions {
  dispatch?: Partial<OutboxDispatchOptions>;
  /** Replaces the Redis emitter, e.g. to simulate Valkey refusing events in tests. */
  publisher?: RealtimePublisher;
}

/**
 * The outbox safety net (ADR-028): the `outbox.dispatch` scheduler, its processor and the
 * publisher it re-emits through. The publisher has its own Valkey connection that fails fast,
 * unlike BullMQ's blocking one, so a dispatch never waits on Valkey while it holds row locks.
 */
@Module({})
export class OutboxModule implements OnApplicationShutdown {
  constructor(@Inject(WORKER_REALTIME_VALKEY) private readonly valkey: Redis) {}

  static register(options: OutboxModuleOptions = {}): DynamicModule {
    const dispatch: OutboxDispatchOptions = { ...DEFAULT_OUTBOX_DISPATCH, ...options.dispatch };
    return {
      module: OutboxModule,
      imports: [BullModule.registerQueue({ name: 'outbox.dispatch' })],
      providers: [
        {
          provide: WORKER_REALTIME_VALKEY,
          inject: [WORKER_ENV],
          useFactory: (env: WorkerEnv) =>
            new Redis(env.REDIS_URL, {
              connectionName: 'radd-worker-realtime',
              maxRetriesPerRequest: 1,
              commandTimeout: 1_000,
            }),
        },
        {
          provide: WORKER_REALTIME,
          inject: [WORKER_REALTIME_VALKEY],
          useFactory: (valkey: Redis): RealtimePublisher =>
            options.publisher ?? new RedisEmitterPublisher(valkey),
        },
        { provide: OUTBOX_DISPATCH_OPTIONS, useValue: dispatch },
        OutboxDispatcher,
        OutboxDispatchProcessor,
      ],
      exports: [OutboxDispatcher],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.valkey.quit().catch(() => undefined);
  }
}
