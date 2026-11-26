import { Body, Controller, Delete, HttpCode, Param, Put } from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';

import { type MemberActor } from '@radd/shared';

import { MemberPinService } from './member-pin.service';
import { MemberParamsDto, SetMemberPinDto } from './staff.dto';
import { CurrentActor, RequirePermission } from '../authz/access.decorators';

/** Quick-switch PINs of the active organisation's staff and kitchen members (ADR-026). */
@ApiTags('staff')
@Controller('members')
export class MemberPinController {
  constructor(private readonly pins: MemberPinService) {}

  /** Sets or replaces a member's PIN; also lifts a PIN disabled after too many failures. */
  @Put(':id/pin')
  @RequirePermission('team.pin.set')
  @HttpCode(204)
  @ApiNoContentResponse()
  async set(
    @CurrentActor() actor: MemberActor,
    @Param() params: MemberParamsDto,
    @Body() body: SetMemberPinDto,
  ): Promise<void> {
    await this.pins.set(actor, params.id, body.pin);
  }

  @Delete(':id/pin')
  @RequirePermission('team.pin.set')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(
    @CurrentActor() actor: MemberActor,
    @Param() params: MemberParamsDto,
  ): Promise<void> {
    await this.pins.remove(actor, params.id);
  }
}
