import { Controller, Get, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { type FastifyReply } from 'fastify';

import { HealthLiveDto, type HealthReady, HealthReadyDto } from './health.dto';
import { ReadinessService } from './readiness.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  /** Process liveness only: never touches dependencies, so a slow DB cannot restart the API. */
  @Get('live')
  @ApiOkResponse({ type: HealthLiveDto })
  live(): HealthLiveDto {
    return { status: 'ok' };
  }

  /** Dependencies reachable; 503 takes the instance out of rotation without restarting it. */
  @Get('ready')
  @ApiOkResponse({ type: HealthReadyDto })
  @ApiServiceUnavailableResponse({ type: HealthReadyDto })
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthReady> {
    const result = await this.readiness.check();
    if (result.status !== 'ok') void reply.status(503);
    return result;
  }
}
