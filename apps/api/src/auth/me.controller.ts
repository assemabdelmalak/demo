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
  @AuthenticatedOnly()
  @ApiOkResponse({ type: MeDto })
  me(@CurrentSession() session: AuthSession): Promise<Me> {
    return this.service.me(session);
  }
}
