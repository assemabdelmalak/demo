import { Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';

import { createDb, type DbHandle } from '@radd/db';

import { ADMIN_DB, ADMIN_POOL_MAX } from './admin-db';
import { AdminOrganizationsController } from './admin-organizations.controller';
import { AdminOrganizationsService } from './admin-organizations.service';
import { API_ENV, type ApiEnv } from '../config/env.module';

/**
 * Super-admin endpoints (`/v1/admin/*`, ADR-027). Not global: the admin pool is visible to this
 * module's providers only. Bull Board (`/v1/admin/queues`) is a raw Fastify plugin registered in
 * `createApp` behind the same check (`admin/bull-board.ts`).
 */
@Module({
  controllers: [AdminOrganizationsController],
  providers: [
    AdminOrganizationsService,
    {
      provide: ADMIN_DB,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): DbHandle => {
        const logger = new Logger('AdminDatabase');
        // node-postgres connects lazily: no admin connection exists until an admin calls.
        return createDb({
          url: env.DATABASE_URL_ADMIN,
          max: ADMIN_POOL_MAX,
          applicationName: 'radd-api-admin',
          onPoolError: (error) => {
            logger.warn({ err: error }, 'admin database pool client error');
          },
        });
      },
    },
  ],
})
export class AdminModule implements OnApplicationShutdown {
  constructor(@Inject(ADMIN_DB) private readonly handle: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close().catch(() => undefined);
  }
}
