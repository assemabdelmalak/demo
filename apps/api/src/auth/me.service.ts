import { Inject, Injectable } from '@nestjs/common';

import { type DbHandle, findUserProfile, listUserMemberships } from '@radd/db';
import { DomainError } from '@radd/shared';

import { type AuthSession } from './auth-session';
import { type Me } from './me.dto';
import { superAdminVerdict } from '../authz/super-admin';
import { API_ENV, type ApiEnv } from '../config/env.module';
import { DB } from '../db/db.module';

/**
 * Reads for `GET /v1/me`. `user`, `member` and `organization` are Better Auth's global tables
 * (no RLS, ADR-022), and the query is scoped by the session's own user ID.
 */
@Injectable()
export class MeService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async me(session: AuthSession): Promise<Me> {
    const user = await findUserProfile(this.handle.db, session.userId);
    // Deleted between the session lookup and now.
    if (!user) throw new DomainError('UNAUTHENTICATED');
    const all = await listUserMemberships(this.handle.db, session.userId);
    // A PIN session lives in its device's organisation and nowhere else (ADR-026).
    const memberships = session.pinSession
      ? all.filter((membership) => membership.organizationId === session.activeOrganizationId)
      : all;

    return {
      user,
      session: {
        id: session.sessionId,
        activeOrganizationId: session.activeOrganizationId,
        pinSession: session.pinSession,
        staffDeviceId: session.staffDeviceId,
        twoFactorVerifiedAt: session.twoFactorVerifiedAt?.toISOString() ?? null,
        createdAt: session.createdAt.toISOString(),
      },
      isSuperAdmin: superAdminVerdict(session, this.env.SUPER_ADMIN_EMAILS) === 'super_admin',
      memberships,
    };
  }
}
