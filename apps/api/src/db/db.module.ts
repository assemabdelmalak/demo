import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';

import { createDb, type DbHandle } from '@radd/db';

import { API_ENV, type ApiEnv } from '../config/env.module';

/** The API's runtime database handle: one pool, connecting as `app_runtime` (RLS enforced). */
export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): DbHandle => {
        const logger = new Logger('Database');
        return createDb({
          url: env.DATABASE_URL,
          max: env.DATABASE_POOL_MAX,
          applicationName: 'radd-api',
          // An idle client error must not crash the process; the next query reports it.
          onPoolError: (error) => {
            logger.warn({ err: error }, 'database pool client error');
          },
        });
      },
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close().catch(() => undefined);
  }
}
