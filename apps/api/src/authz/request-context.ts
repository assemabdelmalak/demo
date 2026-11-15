import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import { type OrganizationRow } from '@radd/db';
import { type MemberActor } from '@radd/shared';

import { type AuthSession } from '../auth/auth-session';

/**
 * What the request is and who makes it, resolved by `AuthzGuard` and available to every service
 * the handler calls (ADR-024). `AuditService` and `OutboxService` (P1-T07) enrich their rows
 * from it.
 */
export interface RequestContextState {
  requestId: string;
  /** The client IP as resolved for rate limits; input to the audit `ipHash`, never stored raw. */
  clientIp: string;
  session?: AuthSession;
  /** Set on `@RequirePermission` routes only. */
  actor?: MemberActor;
  /** The tenant: the organisation the route acts in. */
  organization?: OrganizationRow;
  /** Set when the route is scoped by `:rid`. */
  restaurantId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    raddContext?: RequestContextState;
  }
}

/** Entered by `TenantTransactionInterceptor` around the handler. */
export const requestContextStorage = new AsyncLocalStorage<RequestContextState>();

@Injectable()
export class RequestContext {
  /** Undefined outside a request (jobs, startup). */
  get state(): RequestContextState | undefined {
    return requestContextStorage.getStore();
  }

  get requestId(): string | undefined {
    return this.state?.requestId;
  }

  get clientIp(): string | undefined {
    return this.state?.clientIp;
  }

  get organizationId(): string | undefined {
    return this.state?.organization?.id;
  }

  get restaurantId(): string | undefined {
    return this.state?.restaurantId;
  }

  /** The acting member; throws when called outside a `@RequirePermission` route. */
  get actor(): MemberActor {
    const actor = this.state?.actor;
    if (!actor) throw new Error('No member actor in this request context');
    return actor;
  }
}
