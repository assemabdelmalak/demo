import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import {
  type DbHandle,
  findMemberRole,
  findOrganization,
  findRestaurantOrganization,
  type OrganizationRow,
} from '@radd/db';
import { DomainError, holdsPermission, isUuid, type MemberActor } from '@radd/shared';

import { accessPolicyOf } from './access.decorators';
import { type RequestContextState } from './request-context';
import { superAdminVerdict } from './super-admin';
import { type AuthSession } from '../auth/auth-session';
import { API_ENV, type ApiEnv } from '../config/env.module';
import { DB } from '../db/db.module';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The route parameter that scopes a route to one restaurant (and its organisation). */
export const RESTAURANT_PARAM = 'rid';

/** Same answer whether the restaurant is missing, deleted or someone else's, so IDs cannot be probed. */
const restaurantNotFound = () => new DomainError('NOT_FOUND', { detail: 'Restaurant not found' });
const noActiveOrganization = () =>
  new DomainError('NOT_FOUND', { detail: 'No active organisation' });

interface Scope {
  organization: OrganizationRow;
  restaurantId?: string;
}

/**
 * The global default-deny guard (ADR-024). Registered after the throttler guard, so refused
 * requests still count against rate limits. A route without an access policy is refused.
 *
 * Membership and the restaurant's organisation are read from Better Auth's global tables and
 * `restaurant_org()`, outside any tenant transaction; the handler's transaction opens afterwards
 * in `TenantTransactionInterceptor`.
 */
@Injectable()
export class AuthzGuard implements CanActivate {
  private readonly logger = new Logger(AuthzGuard.name);

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only HTTP exists so far; the Socket.IO gateway (P4-T03) brings its own handshake checks.
    if (context.getType() !== 'http') return false;
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const policy = accessPolicyOf(context.getHandler(), context.getClass());
    const state: RequestContextState = {
      requestId: request.id,
      clientIp: request.clientIp ?? request.ip,
    };

    if (!policy) {
      this.logger.error(
        { route: request.routeOptions.url, method: request.method },
        'route declares no access policy; refused',
      );
      throw new DomainError('FORBIDDEN', { detail: 'Route declares no access policy' });
    }

    if (policy.kind === 'public') {
      request.raddContext = state;
      return true;
    }

    const session = request.authSession;
    if (!session) throw new DomainError('UNAUTHENTICATED');
    state.session = session;

    if (policy.kind === 'authenticated') {
      // Account routes (onboarding, …) are not for a shared tablet's PIN session (ADR-026).
      if (session.pinSession && !policy.allowPinSession) {
        throw new DomainError('FORBIDDEN', { detail: 'Not available in a device session' });
      }
      request.raddContext = state;
      return true;
    }

    if (policy.kind === 'super_admin') {
      const verdict = superAdminVerdict(session, this.env.SUPER_ADMIN_EMAILS);
      // Same answer as any forbidden route: nothing says an admin area exists.
      if (verdict === 'not_admin') throw new DomainError('FORBIDDEN');
      if (verdict === 'two_factor_required') throw new DomainError('TWO_FACTOR_REQUIRED');
      request.raddContext = {
        ...state,
        superAdmin: { kind: 'super_admin', userId: session.userId },
      };
      return true;
    }

    const scope = await this.resolveScope(request, session);
    const actor: MemberActor = {
      kind: 'member',
      userId: session.userId,
      organizationId: scope.organization.id,
      role: await this.roleIn(scope, session),
      pinSession: session.pinSession,
    };
    if (!holdsPermission(actor, policy.action)) {
      throw new DomainError('FORBIDDEN', { detail: `Not allowed: ${policy.action}` });
    }
    // A suspended organisation stays readable; nothing in it may change.
    if (!SAFE_METHODS.has(request.method) && scope.organization.status !== 'active') {
      throw new DomainError('ORG_SUSPENDED');
    }

    request.raddContext = {
      ...state,
      actor,
      organization: scope.organization,
      ...(scope.restaurantId ? { restaurantId: scope.restaurantId } : {}),
    };
    return true;
  }

  /**
   * `:rid` routes act in the restaurant's organisation; others in the session's active one. A
   * PIN session is confined to the organisation it was opened in (its device's, ADR-026).
   */
  private async resolveScope(request: FastifyRequest, session: AuthSession): Promise<Scope> {
    const params = (request.params ?? {}) as Record<string, unknown>;
    if (Object.hasOwn(params, RESTAURANT_PARAM)) {
      const restaurantId = params[RESTAURANT_PARAM];
      if (typeof restaurantId !== 'string' || !isUuid(restaurantId)) throw restaurantNotFound();
      const organizationId = await findRestaurantOrganization(this.handle.db, restaurantId);
      if (!organizationId) throw restaurantNotFound();
      if (session.pinSession && organizationId !== session.activeOrganizationId) {
        throw restaurantNotFound();
      }
      const organization = await findOrganization(this.handle.db, organizationId);
      if (!organization) throw restaurantNotFound();
      return { organization, restaurantId };
    }

    const organizationId = session.activeOrganizationId;
    if (!organizationId) throw noActiveOrganization();
    const organization = await findOrganization(this.handle.db, organizationId);
    if (!organization) throw noActiveOrganization();
    return { organization };
  }

  /**
   * Not a member: 404 on a restaurant route (the restaurant "does not exist" for this caller),
   * 403 NOT_A_MEMBER on the active organisation, which the caller already knows about.
   */
  private async roleIn(scope: Scope, session: AuthSession): Promise<MemberActor['role']> {
    const role = await findMemberRole(this.handle.db, scope.organization.id, session.userId);
    if (role === undefined) {
      throw scope.restaurantId ? restaurantNotFound() : new DomainError('NOT_A_MEMBER');
    }
    return role;
  }
}
