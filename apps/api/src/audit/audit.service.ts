import { Inject, Injectable } from '@nestjs/common';

import { currentTenantScope, type DbExecutor, type DbHandle, insertAuditLog } from '@radd/db';
import { type ActorType } from '@radd/shared';

import { auditIpHash, sanitizeAuditState } from './audit-state';
import { RequestContext, type RequestContextState } from '../authz/request-context';
import { API_ENV, type ApiEnv } from '../config/env.module';
import { DB } from '../db/db.module';

/** What a mutation hands over: the entity and its state before and after (DATA_MODEL §10). */
export interface AuditEntry {
  /** e.g. `restaurant.create`, `staff_device.revoke`, `admin.organization.update`. */
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface AuditActor {
  type: ActorType;
  id: string | null;
}

/** Who acted and from where. Normally read from the request context. */
export interface AuditOrigin {
  actor: AuditActor;
  requestId: string | null;
  /** Hashed before it is stored, never kept raw. */
  clientIp: string | null;
  restaurantId: string | null;
}

/** Overrides for a route whose context does not say who acted (the public PIN switch). */
export interface AuditOverrides {
  actor?: AuditActor;
  restaurantId?: string;
}

/** The actor of a request: the super admin, the member, the signed-in user, or the system. */
export function actorOf(state: RequestContextState | undefined): AuditActor {
  if (state?.superAdmin) return { type: 'super_admin', id: state.superAdmin.userId };
  if (state?.actor) return { type: 'user', id: state.actor.userId };
  if (state?.session) return { type: 'user', id: state.session.userId };
  return { type: 'system', id: null };
}

/**
 * The append-only audit log (SECURITY T8, ARCHITECTURE §9). Every entry is enriched with the
 * actor, organisation, restaurant, request ID and a keyed hash of the client IP, and is written
 * in a transaction that also holds the change, so the two commit or roll back together.
 *
 * - `record`: the usual case, inside the request's tenant transaction.
 * - `recordIn`: a transaction the caller holds, e.g. the admin pool's (ADR-027).
 * - `recordPlatform`: an event that belongs to no organisation (Bull Board, sign-in), written
 *   with no tenant set, which the `audit_append` policy allows only for such entries.
 */
@Injectable()
export class AuditService {
  private readonly secret: string;

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(API_ENV) env: ApiEnv,
    private readonly context: RequestContext,
  ) {
    this.secret = env.ACTOR_HASH_SECRET;
  }

  /** In the current tenant transaction; throws when there is none, rather than not auditing. */
  async record(entry: AuditEntry, overrides: AuditOverrides = {}): Promise<void> {
    const scope = currentTenantScope();
    if (!scope) {
      throw new Error(`audit ${entry.action} needs a tenant transaction; use recordIn instead`);
    }
    await this.write(scope.tx, scope.organizationId, entry, this.origin(overrides));
  }

  /** In `tx`, which the caller holds and in which `organizationId` may be written. */
  async recordIn(
    tx: DbExecutor,
    organizationId: string,
    entry: AuditEntry,
    overrides: AuditOverrides = {},
  ): Promise<void> {
    await this.write(tx, organizationId, entry, this.origin(overrides));
  }

  /**
   * An entry with no organisation, in a transaction of its own on the runtime pool. `origin` is
   * required where no Nest request context exists (Bull Board's raw Fastify routes).
   */
  async recordPlatform(entry: AuditEntry, origin: AuditOrigin = this.origin()): Promise<void> {
    await this.handle.db.transaction((tx) => this.write(tx, null, entry, origin));
  }

  /** The current request's origin, with any overrides applied. */
  origin(overrides: AuditOverrides = {}): AuditOrigin {
    const state = this.context.state;
    return {
      actor: overrides.actor ?? actorOf(state),
      requestId: state?.requestId ?? null,
      clientIp: state?.clientIp ?? null,
      restaurantId: overrides.restaurantId ?? state?.restaurantId ?? null,
    };
  }

  private async write(
    tx: DbExecutor,
    organizationId: string | null,
    entry: AuditEntry,
    origin: AuditOrigin,
  ): Promise<void> {
    await insertAuditLog(tx, {
      organizationId,
      restaurantId: origin.restaurantId,
      actorType: origin.actor.type,
      actorId: origin.actor.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: sanitizeAuditState(entry.before, origin.clientIp),
      after: sanitizeAuditState(entry.after, origin.clientIp),
      ipHash: origin.clientIp === null ? null : auditIpHash(this.secret, origin.clientIp),
      requestId: origin.requestId,
    });
  }
}
