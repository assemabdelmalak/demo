import {
  type ArgumentMetadata,
  type DynamicModule,
  Injectable,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';

import { loggerOptions } from '@radd/config/logging';
import { type Mailer } from '@radd/mail';
import { DomainError } from '@radd/shared';
import { type RealtimePublisher } from '@radd/shared/realtime-publisher';

import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule, type AuthModuleOptions } from './auth/auth.module';
import { AuthzModule } from './authz/authz.module';
import { zodFieldErrors } from './common/problem';
import { ProblemDetailsFilter } from './common/problem.filter';
import { REQUEST_ID_HEADER } from './common/request-id';
import { type ApiEnv, EnvModule } from './config/env.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { type IdempotencyOptions } from './idempotency/idempotency.store';
import { MailModule } from './mail/mail.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OutboxModule } from './outbox/outbox.module';
import { QueuesModule } from './queues/queues.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { StaffModule, type StaffModuleOptions } from './staff/staff.module';
import { ThrottlingModule } from './throttling/throttling.module';
import { ValkeyModule } from './valkey/valkey.module';

/** Every body, query and param must be declared with a zod DTO (SEC §2). */
const StrictZodPipe = createZodValidationPipe({
  strictSchemaDeclaration: true,
  createValidationException: (error: unknown) =>
    new DomainError('VALIDATION_FAILED', {
      errors: error instanceof ZodError ? zodFieldErrors(error) : [],
    }),
});

/**
 * Custom parameter decorators (`@CurrentActor()`, `@CurrentSession()`) hand over what the server
 * resolved, never client input, so they have no DTO; everything from the request still must.
 */
@Injectable()
export class ZodPipe extends StrictZodPipe {
  override transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type === 'custom') return value;
    return super.transform(value, metadata);
  }
}

export interface AppModuleOptions {
  /** Extra modules, e.g. test-only routes. Production passes none. */
  imports?: ModuleMetadata['imports'];
  /** Overrides for tests; production uses the defaults. */
  idempotency?: Partial<IdempotencyOptions>;
  /** Replaces the configured mail adapter, e.g. with a `MemoryMailer` in tests. */
  mailer?: Mailer;
  /** Auth rate limits; both are on unless a test turns them off. */
  auth?: AuthModuleOptions;
  /** PIN lockout windows; tests shorten them. */
  staff?: StaffModuleOptions;
  /** Replaces the Redis emitter behind the outbox, e.g. to simulate Valkey failing. */
  realtime?: RealtimePublisher;
}

@Module({})
export class AppModule {
  static register(env: ApiEnv, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.register(env),
        // Names Sentry transactions after the route; inert when Sentry is not initialised.
        SentryModule.forRoot(),
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
        DbModule,
        ValkeyModule,
        MailModule.register(options.mailer),
        QueuesModule,
        ThrottlingModule,
        IdempotencyModule.register(options.idempotency),
        // After the throttler and idempotency modules: global enhancers run in registration order
        // (see AuthzModule).
        AuthzModule,
        AuditModule,
        OutboxModule.register(options.realtime),
        AuthModule.register(options.auth),
        OrganizationsModule,
        RestaurantsModule,
        StaffModule.register(options.staff),
        AdminModule,
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
