import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { type Action, isAction, type MemberActor } from '@radd/shared';

import { type AuthSession } from '../auth/auth-session';

/**
 * Every route declares exactly one access policy (ADR-024). The global `AuthzGuard` refuses a
 * route that declares none, and a unit test fails the build on one.
 */
export type AccessPolicy =
  { kind: 'public' } | { kind: 'authenticated' } | { kind: 'permission'; action: Action };

export const ACCESS_POLICY = 'radd:access-policy';
export const NO_TENANT_TRANSACTION = 'radd:no-tenant-transaction';

/** The policy declared on a handler, or else on its controller. */
export function accessPolicyOf(
  handler: object,
  controller: object | undefined,
): AccessPolicy | undefined {
  return (Reflect.getMetadata(ACCESS_POLICY, handler) ??
    (controller ? Reflect.getMetadata(ACCESS_POLICY, controller) : undefined)) as
    AccessPolicy | undefined;
}

/**
 * Works on a method or a class. Declaring two policies on the same target is a programming
 * error, caught when the module loads rather than silently letting the last one win.
 */
function declare(policy: AccessPolicy): MethodDecorator & ClassDecorator {
  return (target: object, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const value: unknown = descriptor?.value;
    const holder: object = typeof value === 'function' ? value : target;
    if (Reflect.hasOwnMetadata(ACCESS_POLICY, holder)) {
      throw new Error(
        'A route may declare only one of @Public, @AuthenticatedOnly, @RequirePermission',
      );
    }
    Reflect.defineMetadata(ACCESS_POLICY, policy, holder);
  };
}

/** Anyone, signed in or not: health checks, docs, public diner reads. */
export const Public = (): MethodDecorator & ClassDecorator => declare({ kind: 'public' });

/**
 * Any signed-in user, with or without an organisation: `GET /v1/me`, onboarding. No tenant
 * context; the service checks whatever else applies.
 */
export const AuthenticatedOnly = (): MethodDecorator & ClassDecorator =>
  declare({ kind: 'authenticated' });

/**
 * A member holding `action` in the route's organisation. Routes with `:rid` take the
 * restaurant's organisation; others take the session's active organisation. The handler runs in
 * that tenant's transaction. Services still call `assertCan` (SECURITY §2): this is the first
 * check, not the only one.
 */
export const RequirePermission = (action: Action): MethodDecorator & ClassDecorator => {
  if (!isAction(action)) throw new Error(`Unknown permission action: ${String(action)}`);
  return declare({ kind: 'permission', action });
};

/**
 * Runs a tenant-scoped handler without the request transaction, for long-lived routes (the AI
 * chat stream, exports) that must not hold a pooled connection for minutes. Such a handler opens
 * its own short `withTenant` transactions. No route uses it yet.
 */
export const WithoutTenantTransaction = (): MethodDecorator => (target, _key, descriptor) => {
  Reflect.defineMetadata(NO_TENANT_TRANSACTION, true, descriptor.value ?? target);
};

/** The member acting on a `@RequirePermission` route, resolved by the guard. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MemberActor => {
    const actor = context.switchToHttp().getRequest<FastifyRequest>().raddContext?.actor;
    // Only reachable when the decorator is used on a route without @RequirePermission.
    if (!actor) throw new Error('@CurrentActor() needs a @RequirePermission route');
    return actor;
  },
);

/** The signed-in session on an `@AuthenticatedOnly` or `@RequirePermission` route. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession => {
    const session = context.switchToHttp().getRequest<FastifyRequest>().raddContext?.session;
    if (!session) throw new Error('@CurrentSession() needs a signed-in route');
    return session;
  },
);
