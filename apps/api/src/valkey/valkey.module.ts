import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { API_ENV, type ApiEnv } from '../config/env.module';

export const VALKEY = Symbol('VALKEY');

@Global()
@Module({
  providers: [
    {
      provide: VALKEY,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) =>
        new Redis(env.REDIS_URL, {
          connectionName: 'radd-api',
          // Fail fast instead of queueing forever: callers decide whether to fail open or closed.
          maxRetriesPerRequest: 1,
          commandTimeout: 1_000,
        }),
    },
  ],
  exports: [VALKEY],
})
export class ValkeyModule implements OnApplicationShutdown {
  constructor(@Inject(VALKEY) private readonly valkey: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.valkey.quit().catch(() => undefined);
  }
}
