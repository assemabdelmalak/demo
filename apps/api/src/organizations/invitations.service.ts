import { Inject, Injectable } from '@nestjs/common';

import {
  type CreateInvitationInput,
  type InvitationView,
  invitationSchema,
  type UiLocale,
} from '@radd/shared';

import {
  assertAccountSession,
  assertCanInvite,
  assertOrganizationWritable,
} from './organization.rules';
import { OrganizationsService } from './organizations.service';
import { recordAuditLater } from '../audit/audit.seam';
import { toDomainError } from '../auth/auth-errors';
import { type AuthSession } from '../auth/auth-session';
import { type Auth } from '../auth/auth.config';
import { AUTH } from '../auth/auth.module';
import { runWithRequestLocale } from '../auth/request-locale';

/**
 * Invitations into the current organisation. Better Auth stores the invitation, cancels an
 * earlier pending one for the same address and calls `sendInvitationEmail`, which puts the email
 * on the `notify.email` queue in the inviter's language. Accepting, rejecting and reading stay
 * Better Auth's own endpoints.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly organizations: OrganizationsService,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  async create(
    session: AuthSession,
    input: CreateInvitationInput,
    headers: Headers,
    locale: UiLocale,
  ): Promise<InvitationView> {
    assertAccountSession(session);
    const { organization, role } = await this.organizations.current(session);
    assertCanInvite(role, input.role);
    assertOrganizationWritable(organization);

    let invitation: Awaited<ReturnType<Auth['api']['createInvitation']>>;
    try {
      invitation = await runWithRequestLocale(locale, () =>
        this.auth.api.createInvitation({
          headers,
          // The role is always passed: Better Auth's default (`member`) is not one of ours.
          body: { email: input.email, role: input.role, organizationId: organization.id },
        }),
      );
    } catch (error) {
      throw toDomainError(error);
    }
    const view = invitationSchema.parse({
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: new Date(invitation.expiresAt).toISOString(),
      createdAt: new Date(invitation.createdAt).toISOString(),
    });
    recordAuditLater({
      action: 'invitation.create',
      entityType: 'invitation',
      entityId: view.id,
      organizationId: view.organizationId,
      after: { role: view.role, expiresAt: view.expiresAt },
    });
    return view;
  }
}
