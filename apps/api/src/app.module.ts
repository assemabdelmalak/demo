import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';

import { loggerOptions } from '@radd/config/logging';
import { DomainError } from '@radd/shared';

import { zodFieldErrors } from './common/problem';
import { ProblemDetailsFilter } from './common/problem.filter';
import { REQUEST_ID_HEADER } from './common/request-id';
import { type ApiEnv, EnvModule } from './config/env.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { type IdempotencyOptions } from './idempotency/idempotency.store';
import { QueuesModule } from './queues/queues.module';
import { ThrottlingModule } from './throttling/throttling.module';
import { ValkeyModule } from './valkey/valkey.module';

/** Every body, query and param must be declared with a zod DTO (SEC §2). */
const ZodPipe = createZodValidationPipe({
  strictSchemaDeclaration: true,
  createValidationException: (error: unknown) =>
    new DomainError('VALIDATION_FAILED', {
      errors: error instanceof ZodError ? zodFieldErrors(error) : [],
    }),
});

export interface AppModuleOptions {
  /** Extra modules, e.g. test-only routes. Production passes none. */
  imports?: ModuleMetadata['imports'];
  /** Overrides for tests; production uses the defaults. */
  idempotency?: Partial<IdempotencyOptions>;
}

@Module({})
export class AppModule {
  static register(env: ApiEnv, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.register(env),
        LoggerModule.forRoot({
          pinoHttp: {
            ...loggerOptions({
              service: 'api',
              level: env.LOG_LEVEL,
              pretty: env.APP_ENV === 'local' && env.NODE_ENV !== 'test',
              release: env.GIT_SHA,
            }),
            // Fastify's genReqId already validated or minted the ID and wrote it back to this header.
            genReqId: (req) => String(req.headers[REQUEST_ID_HEADER]),
            customProps: (req) => ({ requestId: req.headers[REQUEST_ID_HEADER] }),
            // Middleware sees a mount-relative `url`; `originalUrl` is the full path.
            autoLogging: {
              ignore: (req) =>
                ((req as { originalUrl?: string }).originalUrl ?? req.url ?? '').startsWith(
                  '/v1/health/',
                ),
            },
          },
        }),
        ValkeyModule,
        QueuesModule,
        ThrottlingModule,
        IdempotencyModule.register(options.idempotency),
        HealthModule,
        ...(options.imports ?? []),
      ],
      providers: [
        { provide: APP_PIPE, useClass: ZodPipe },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    };
  }
}
