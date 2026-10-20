import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('health')
export class HealthController {
  /** Process liveness only: never touches dependencies, so a slow DB cannot restart the API. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
