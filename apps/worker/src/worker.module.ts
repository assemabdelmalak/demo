import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';

import { loggerOptions } from '@radd/config/logging';
import { DEFAULT_JOB_OPTIONS, QUEUE_PREFIX } from '@radd/shared';

import { EnvModule, type WorkerEnv } from './config/env.module';
import { HeartbeatService } from './health/heartbeat.service';
import { ProbeServer } from './health/probe.server';
import { NoopProcessor } from './processors/noop.processor';
import { createWorkerConnection, WORKER_VALKEY } from './valkey';

/** Queues that have a processor in this phase; the rest gain one as their features land. */
const PROCESSED_QUEUES = ['noop'] as const;

@Module({})
export class WorkerModule implements OnApplicationShutdown {
  constructor(@Inject(WORKER_VALKEY) private readonly valkey: Redis) {}

  static register(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        EnvModule.register(env),
        LoggerModule.forRoot({
          pinoHttp: loggerOptions({
            service: 'worker',
            level: env.LOG_LEVEL,
            pretty: env.APP_ENV === 'local' && env.NODE_ENV !== 'test',
            release: env.GIT_SHA,
          }),
        }),
        BullModule.forRoot({
          connection: createWorkerConnection(env.REDIS_URL, 'radd-worker-bullmq'),
          prefix: QUEUE_PREFIX,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
        ...PROCESSED_QUEUES.map((name) => BullModule.registerQueue({ name })),
      ],
      providers: [
        {
          provide: WORKER_VALKEY,
          useFactory: () => createWorkerConnection(env.REDIS_URL, 'radd-worker'),
        },
        HeartbeatService,
        ProbeServer,
        NoopProcessor,
      ],
      exports: [HeartbeatService, ProbeServer],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.valkey.quit().catch(() => undefined);
  }
}
