import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuthzGuard } from './authz.guard';
import { RequestContext } from './request-context';
import { TenantTransactionInterceptor } from './tenant-transaction.interceptor';

/**
 * The default-deny guard, the tenant transaction and the request context (ADR-024).
 *
 * Global enhancers run in the order their modules are registered, so `AppModule` imports this
 * module after `ThrottlingModule` (rate limits apply to refused requests) and after
 * `IdempotencyModule` (the replay is stored only once the transaction has committed). An
 * integration test checks both orders. Import it nowhere else.
 */
@Global()
@Module({
  providers: [
    RequestContext,
    { provide: APP_GUARD, useClass: AuthzGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
  ],
  exports: [RequestContext],
})
export class AuthzModule {}
