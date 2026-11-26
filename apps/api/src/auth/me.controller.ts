import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { type AuthSession } from './auth-session';
import { type Me, MeDto } from './me.dto';
import { MeService } from './me.service';
import { AuthenticatedOnly, CurrentSession } from '../authz/access.decorators';

@ApiTags('auth')
@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  /** The signed-in user, the current session and the organisations they belong to. */
  @Get()
  // A PIN session reads who it is too; the console renders device mode from it.
  @AuthenticatedOnly({ allowPinSession: true })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentSession() session: AuthSession): Promise<Me> {
    return this.service.me(session);
  }
}
