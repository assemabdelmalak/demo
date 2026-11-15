import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type FastifyRequest } from 'fastify';
import { defer, lastValueFrom, Observable } from 'rxjs';

import { type DbHandle, withTenant } from '@radd/db';

import { NO_TENANT_TRANSACTION } from './access.decorators';
import { requestContextStorage } from './request-context';
import { DB } from '../db/db.module';

/**
 * Runs each tenant-scoped handler inside one `withTenant` transaction (ADR-024), with the request
 * context in AsyncLocalStorage. Repositories extending `BaseTenantRepository`, and later
 * `AuditService` and `OutboxService`, all join that transaction.
 *
 * The transaction commits before the value reaches Nest, so the response is only sent once the
 * change is durable; a thrown error rolls it back. Registered after the idempotency interceptor,
 * so the stored replay is written only after the commit.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const state = context.switchToHttp().getRequest<FastifyRequest>().raddContext;
    // The guard sets the context on every route it lets through.
    if (!state) return next.handle();

    const organizationId = state.organization?.id;
    const optedOut = Reflect.getMetadata(NO_TENANT_TRANSACTION, context.getHandler()) === true;
    if (!organizationId || optedOut) {
      return new Observable((subscriber) =>
        requestContextStorage.run(state, () => next.handle().subscribe(subscriber)),
      );
    }

    return defer(() =>
      requestContextStorage.run(state, () =>
        withTenant(this.handle.db, organizationId, () =>
          lastValueFrom(next.handle(), { defaultValue: undefined }),
        ),
      ),
    );
  }
}
