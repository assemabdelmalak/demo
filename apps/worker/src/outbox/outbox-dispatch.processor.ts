import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type Job, type Queue, UnrecoverableError } from 'bullmq';

import { QUEUES } from '@radd/shared';

import {
  type DispatchResult,
  OUTBOX_DISPATCH_OPTIONS,
  type OutboxDispatchOptions,
  OutboxDispatcher,
} from './outbox-dispatcher';
import { ReportingWorkerHost } from '../processors/reporting-worker-host';

/** The scheduler's ID in Valkey; every worker process upserts the same one. */
export const OUTBOX_DISPATCH_SCHEDULER = 'outbox.dispatch';

/**
 * Runs the outbox dispatcher on every tick of a BullMQ job scheduler (every 5 s, ADR-028). A
 * failed tick is not retried: the next tick is the retry, so failures cannot pile up. Concurrency
 * is 1 per process, and `SKIP LOCKED` keeps several processes from sending the same event.
 */
@Processor('outbox.dispatch', { concurrency: QUEUES['outbox.dispatch'].concurrency })
export class OutboxDispatchProcessor extends ReportingWorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxDispatchProcessor.name);

  constructor(
    private readonly dispatcher: OutboxDispatcher,
    @InjectQueue('outbox.dispatch') private readonly queue: Queue,
    @Inject(OUTBOX_DISPATCH_OPTIONS) private readonly options: OutboxDispatchOptions,
  ) {
    super();
  }

  /** Idempotent: upserting the same scheduler from every worker keeps one schedule. */
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      OUTBOX_DISPATCH_SCHEDULER,
      { every: this.options.everyMs },
      {
        name: 'outbox.dispatch',
        data: {},
        opts: {
          attempts: 1,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      },
    );
    this.logger.log({ everyMs: this.options.everyMs }, 'outbox dispatch scheduled');
  }

  async process(job: Job): Promise<DispatchResult> {
    if (!QUEUES['outbox.dispatch'].payload.safeParse(job.data).success) {
      throw new UnrecoverableError('invalid outbox.dispatch payload');
    }
    return this.dispatcher.run();
  }
}
