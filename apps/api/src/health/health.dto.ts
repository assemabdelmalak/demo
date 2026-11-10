import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const checkStatus = z.enum(['ok', 'error']);

export class HealthLiveDto extends createZodDto(z.object({ status: z.literal('ok') })) {}

export class HealthReadyDto extends createZodDto(
  z.object({
    status: checkStatus,
    checks: z.object({ database: checkStatus, valkey: checkStatus, queue: checkStatus }),
  }),
) {}

export type HealthReady = z.infer<typeof HealthReadyDto.schema>;
