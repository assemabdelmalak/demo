import { setTimeout as delay } from 'node:timers/promises';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';

import { QUEUES } from '@radd/shared';

/** Proves the plumbing: validation, retries with backoff, and draining on shutdown (P0-T05). */
@Processor('noop', { concurrency: QUEUES.noop.concurrency })
export class NoopProcessor extends WorkerHost {
  private readonly logger = new Logger(NoopProcessor.name);

  async process(job: Job): Promise<{ echo: string }> {
    const parsed = QUEUES.noop.payload.safeParse(job.data);
    if (!parsed.success) {
      // Retrying cannot fix a malformed payload.
      throw new UnrecoverableError('invalid noop payload');
    }
    const { message, fail, delayMs } = parsed.data;
    if (delayMs > 0) await delay(delayMs);
    if (fail) throw new Error(`noop failure requested (attempt ${String(job.attemptsMade + 1)})`);
    this.logger.debug({ jobId: job.id }, 'noop processed');
    return { echo: message };
  }
}
