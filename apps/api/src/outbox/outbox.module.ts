import { type DynamicModule, Global, Module } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { OutboxRepository } from '@radd/db';
import { RedisEmitterPublisher, type RealtimePublisher } from '@radd/shared/realtime-publisher';

import { OutboxService, REALTIME_PUBLISHER } from './outbox.service';
import { VALKEY } from '../valkey/valkey.module';

/**
 * The outbox and its realtime publisher, available to every module. The publisher emits through
 * the API's Valkey connection, whose short command timeout keeps a slow Valkey from holding up
 * responses for long; the worker repairs anything that was not sent.
 */
@Global()
@Module({})
export class OutboxModule {
  /** `publisher` replaces the Redis emitter, e.g. to simulate a failure in tests. */
  static register(publisher?: RealtimePublisher): DynamicModule {
    return {
      module: OutboxModule,
      providers: [
        {
          provide: REALTIME_PUBLISHER,
          inject: [VALKEY],
          useFactory: (valkey: Redis): RealtimePublisher =>
            publisher ?? new RedisEmitterPublisher(valkey),
        },
        // The repository takes its transaction from the tenant scope, so one instance serves all.
        { provide: OutboxRepository, useValue: new OutboxRepository() },
        OutboxService,
      ],
      exports: [OutboxService, REALTIME_PUBLISHER],
    };
  }
}
