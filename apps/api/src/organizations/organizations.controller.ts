import { Body, Controller, Get, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type FastifyRequest } from 'fastify';

import { type MemberActor, type MemberList, type OrganizationView } from '@radd/shared';

import {
  CreateOrganizationDto,
  ListMembersQueryDto,
  MemberListDto,
  OrganizationDto,
  UpdateOrganizationDto,
} from './organizations.dto';
import { OrganizationsService } from './organizations.service';
import { authHeaders } from './request-context';
import { type AuthSession } from '../auth/auth-session';
import {
  AuthenticatedOnly,
  CurrentActor,
  CurrentSession,
  RequirePermission,
} from '../authz/access.decorators';
import { IDEMPOTENCY_HEADER, Idempotent } from '../idempotency/idempotent.decorator';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  /** Onboarding step 0: creates an organisation owned by the caller and makes it active. */
  @Post()
  @AuthenticatedOnly()
  @Idempotent()
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true, description: 'UUID' })
  @ApiCreatedResponse({ type: OrganizationDto })
  create(
    @CurrentSession() session: AuthSession,
    @Req() request: FastifyRequest,
    @Body() body: CreateOrganizationDto,
  ): Promise<OrganizationView> {
    return this.service.create(session, body.name, authHeaders(request));
  }

  /** The session's active organisation. */
  @Get('current')
  @RequirePermission('org.read')
  @ApiOkResponse({ type: OrganizationDto })
  current(@CurrentActor() actor: MemberActor): Promise<OrganizationView> {
    return this.service.read(actor);
  }

  /** Renames the active organisation (owner or manager). */
  @Patch('current')
  @RequirePermission('org.update')
  @ApiOkResponse({ type: OrganizationDto })
  update(
    @CurrentActor() actor: MemberActor,
    @Req() request: FastifyRequest,
    @Body() body: UpdateOrganizationDto,
  ): Promise<OrganizationView> {
    return this.service.update(actor, body.name, authHeaders(request));
  }

  /** The active organisation's members (any member may read). */
  @Get('current/members')
  @RequirePermission('team.read')
  @ApiOkResponse({ type: MemberListDto })
  members(
    @CurrentActor() actor: MemberActor,
    @Query() query: ListMembersQueryDto,
  ): Promise<MemberList> {
    return this.service.members(actor, query);
  }
}
