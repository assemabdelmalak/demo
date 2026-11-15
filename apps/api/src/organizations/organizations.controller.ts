import { Body, Controller, Get, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type FastifyRequest } from 'fastify';

import { type MemberList, type OrganizationView } from '@radd/shared';

import {
  CreateOrganizationDto,
  ListMembersQueryDto,
  MemberListDto,
  OrganizationDto,
  UpdateOrganizationDto,
} from './organizations.dto';
import { OrganizationsService } from './organizations.service';
import { authHeaders, requireSession } from './request-context';
import { IDEMPOTENCY_HEADER, Idempotent } from '../idempotency/idempotent.decorator';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  /** Onboarding step 0: creates an organisation owned by the caller and makes it active. */
  @Post()
  @Idempotent()
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true, description: 'UUID' })
  @ApiCreatedResponse({ type: OrganizationDto })
  create(
    @Req() request: FastifyRequest,
    @Body() body: CreateOrganizationDto,
  ): Promise<OrganizationView> {
    return this.service.create(requireSession(request), body.name, authHeaders(request));
  }

  /** The session's active organisation. */
  @Get('current')
  @ApiOkResponse({ type: OrganizationDto })
  current(@Req() request: FastifyRequest): Promise<OrganizationView> {
    return this.service.read(requireSession(request));
  }

  /** Renames the active organisation (owner or manager). */
  @Patch('current')
  @ApiOkResponse({ type: OrganizationDto })
  update(
    @Req() request: FastifyRequest,
    @Body() body: UpdateOrganizationDto,
  ): Promise<OrganizationView> {
    return this.service.update(requireSession(request), body.name, authHeaders(request));
  }

  /** The active organisation's members (any member may read). */
  @Get('current/members')
  @ApiOkResponse({ type: MemberListDto })
  members(
    @Req() request: FastifyRequest,
    @Query() query: ListMembersQueryDto,
  ): Promise<MemberList> {
    return this.service.members(requireSession(request), query);
  }
}
