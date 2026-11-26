import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import {
  type MemberActor,
  type PinSwitchResult,
  type StaffDeviceList,
  type StaffDeviceView,
} from '@radd/shared';

import { type DeviceCookieSpec, serializeDeviceCookie } from './device-cookie';
import { DEVICE_COOKIE, PinSwitchService } from './pin-switch.service';
import { StaffDevicesService } from './staff-devices.service';
import {
  CreateStaffDeviceDto,
  ListStaffDevicesQueryDto,
  PinSwitchDto,
  PinSwitchResultDto,
  StaffDeviceDto,
  StaffDeviceListDto,
  StaffDeviceParamsDto,
  StaffDeviceRestaurantParamsDto,
} from './staff.dto';
import { CurrentActor, Public, RequirePermission } from '../authz/access.decorators';
import { IDEMPOTENCY_HEADER, Idempotent } from '../idempotency/idempotent.decorator';

/** Shared tablets and the PIN quick-switch (ADR-026, API §2 and §4 "Team"). */
@ApiTags('staff')
@Controller()
export class StaffDevicesController {
  constructor(
    private readonly devices: StaffDevicesService,
    private readonly switcher: PinSwitchService,
    @Inject(DEVICE_COOKIE) private readonly cookie: DeviceCookieSpec,
  ) {}

  /**
   * Registers the calling browser as a shared tablet of the restaurant. The device token goes into
   * an HttpOnly cookie for the API host only, never into the body; a replay of the same
   * Idempotency-Key returns the device without a cookie.
   */
  @Post('restaurants/:rid/staff-devices')
  @RequirePermission('devices.manage')
  @Idempotent()
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true, description: 'UUID' })
  @ApiCreatedResponse({ type: StaffDeviceDto })
  async register(
    @CurrentActor() actor: MemberActor,
    @Param() params: StaffDeviceRestaurantParamsDto,
    @Body() body: CreateStaffDeviceDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StaffDeviceView> {
    const { device, token } = await this.devices.register(actor, params.rid, body);
    void reply.header('set-cookie', serializeDeviceCookie(this.cookie, token));
    return device;
  }

  /** The restaurant's registered devices, revoked ones included. */
  @Get('restaurants/:rid/staff-devices')
  @RequirePermission('devices.manage')
  @ApiOkResponse({ type: StaffDeviceListDto })
  list(
    @CurrentActor() actor: MemberActor,
    @Param() params: StaffDeviceRestaurantParamsDto,
    @Query() query: ListStaffDevicesQueryDto,
  ): Promise<StaffDeviceList> {
    return this.devices.list(actor, params.rid, query);
  }

  /** Revokes a device of the active organisation and ends every session opened on it. */
  @Delete('staff-devices/:id')
  @RequirePermission('devices.manage')
  @ApiOkResponse({ type: StaffDeviceDto })
  revoke(
    @CurrentActor() actor: MemberActor,
    @Param() params: StaffDeviceParamsDto,
  ): Promise<StaffDeviceView> {
    return this.devices.revoke(actor, params.id);
  }

  /**
   * Opens a 12-hour PIN session for a staff or kitchen member on this device. Public, because the
   * tablet may have nobody signed in; it needs the device's own cookie and the member's PIN, and
   * every refusal looks the same (generic 403).
   */
  @Post('staff-devices/:id/switch')
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: PinSwitchResultDto })
  @ApiNoContentResponse({ description: 'Never sent; listed for completeness of the schema.' })
  async switch(
    @Param() params: StaffDeviceParamsDto,
    @Body() body: PinSwitchDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PinSwitchResult> {
    const { result, setCookies } = await this.switcher.switch(params.id, body, request);
    if (setCookies.length > 0) void reply.header('set-cookie', setCookies);
    return result;
  }
}
