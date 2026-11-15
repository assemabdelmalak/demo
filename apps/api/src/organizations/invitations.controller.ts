import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiTags } from '@nestjs/swagger';
import { type FastifyRequest } from 'fastify';

import { type InvitationView, type MemberActor } from '@radd/shared';

import { InvitationsService } from './invitations.service';
import { CreateInvitationDto, InvitationDto } from './organizations.dto';
import { authHeaders, requestLocale } from './request-context';
import { LOCALE_HEADER } from '../auth/auth.utils';
import { CurrentActor, RequirePermission } from '../authz/access.decorators';
import { IDEMPOTENCY_HEADER, Idempotent } from '../idempotency/idempotent.decorator';

@ApiTags('organizations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  /**
   * Invites an address into the active organisation. Owners invite managers, staff and kitchen;
   * managers invite staff and kitchen. The email is sent in the `x-radd-locale` language.
   */
  @Post()
  // The least an invitation needs; the service checks the invited role (`team.invite.manager`).
  @RequirePermission('team.invite.staff')
  @Idempotent()
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true, description: 'UUID' })
  @ApiHeader({ name: LOCALE_HEADER, required: false, description: 'en or ar' })
  @ApiCreatedResponse({ type: InvitationDto })
  create(
    @CurrentActor() actor: MemberActor,
    @Req() request: FastifyRequest,
    @Body() body: CreateInvitationDto,
  ): Promise<InvitationView> {
    return this.service.create(actor, body, authHeaders(request), requestLocale(request));
  }
}
