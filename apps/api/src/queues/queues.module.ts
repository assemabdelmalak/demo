import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, QUEUE_PREFIX } from '@radd/shared';

import { QueueProducer } from './queue-producer';
import { VALKEY } from '../valkey/valkey.module';

/** Producer side only: the API enqueues, `apps/worker` processes. */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [VALKEY],
      useFactory: (valkey: Redis) => ({
        connection: valkey,
        prefix: QUEUE_PREFIX,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    ...QUEUE_NAMES.map((name) => BullModule.registerQueue({ name })),
  ],
  providers: [QueueProducer],
  exports: [QueueProducer],
})
export class QueuesModule {}
