import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';

import { createDb, type DbHandle } from '@radd/db';

import { WORKER_ENV, type WorkerEnv } from '../config/env.module';

/**
 * The worker's database handle: one pool connecting as `app_worker` (`DATABASE_URL_WORKER`).
 * Row Level Security applies to it as to the API; across organisations it can only claim and
 * mark outbox events, through the definer functions granted to it alone (ADR-028).
 */
export const WORKER_DB = Symbol('WORKER_DB');

@Global()
@Module({
  providers: [
    {
      provide: WORKER_DB,
      inject: [WORKER_ENV],
      useFactory: (env: WorkerEnv): DbHandle => {
        const logger = new Logger('Database');
        // node-postgres connects lazily: nothing is opened until a job queries.
        return createDb({
          url: env.DATABASE_URL_WORKER,
          max: env.DATABASE_POOL_MAX,
          applicationName: 'radd-worker',
          onPoolError: (error) => {
            logger.warn({ err: error }, 'database pool client error');
          },
        });
      },
    },
  ],
  exports: [WORKER_DB],
})
export class WorkerDbModule implements OnApplicationShutdown {
  constructor(@Inject(WORKER_DB) private readonly handle: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close().catch(() => undefined);
  }
}
