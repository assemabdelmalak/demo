import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import {
  type AdminOrganizationList,
  type AdminOrganizationView,
  type SuperAdminActor,
} from '@radd/shared';

import { AdminOrganizationsService } from './admin-organizations.service';
import {
  AdminListOrganizationsQueryDto,
  AdminOrganizationDto,
  AdminOrganizationListDto,
  AdminOrganizationParamsDto,
  AdminUpdateOrganizationDto,
} from './admin.dto';
import { CurrentSuperAdmin, RequireSuperAdmin } from '../authz/access.decorators';

/**
 * `/v1/admin/orgs` (API §5). Super admins only (ADR-027): an allowlisted, verified address with
 * two-factor on and a TOTP check on this session within 12 hours. Anyone else gets 403.
 */
@ApiTags('admin')
@Controller('admin/orgs')
@RequireSuperAdmin()
export class AdminOrganizationsController {
  constructor(private readonly organizations: AdminOrganizationsService) {}

  /** Every organisation, optionally filtered by name or slug, in creation order. */
  @Get()
  @ApiOkResponse({ type: AdminOrganizationListDto })
  list(
    @CurrentSuperAdmin() actor: SuperAdminActor,
    @Query() query: AdminListOrganizationsQueryDto,
  ): Promise<AdminOrganizationList> {
    return this.organizations.list(actor, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminOrganizationDto })
  read(
    @CurrentSuperAdmin() actor: SuperAdminActor,
    @Param() params: AdminOrganizationParamsDto,
  ): Promise<AdminOrganizationView> {
    return this.organizations.read(actor, params.id);
  }

  /** Suspend or reinstate an organisation, or change its plan. */
  @Patch(':id')
  @ApiOkResponse({ type: AdminOrganizationDto })
  update(
    @CurrentSuperAdmin() actor: SuperAdminActor,
    @Param() params: AdminOrganizationParamsDto,
    @Body() body: AdminUpdateOrganizationDto,
  ): Promise<AdminOrganizationView> {
    return this.organizations.update(actor, params.id, body);
  }
}
