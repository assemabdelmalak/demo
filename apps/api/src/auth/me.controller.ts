import { Controller, Get, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type FastifyRequest } from 'fastify';

import { DomainError } from '@radd/shared';

import { type Me, MeDto } from './me.dto';
import { MeService } from './me.service';

@ApiTags('auth')
@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  /** The signed-in user, the current session and the organisations they belong to. */
  @Get()
  @ApiOkResponse({ type: MeDto })
  me(@Req() request: FastifyRequest): Promise<Me> {
    if (!request.authSession) throw new DomainError('UNAUTHENTICATED');
    return this.service.me(request.authSession);
  }
}
