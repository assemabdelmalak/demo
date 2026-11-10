import { getQueueToken } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { type JobsOptions, type Queue } from 'bullmq';

import { parseQueuePayload, type QueueName, type QueuePayloadInput } from '@radd/shared';

/**
 * The only way API code schedules background work. Payloads are validated against the shared
 * registry before they reach Valkey, so the worker never sees a job it cannot parse.
 */
@Injectable()
export class QueueProducer {
  constructor(private readonly moduleRef: ModuleRef) {}

  queue(name: QueueName): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
  }

  async enqueue<N extends QueueName>(
    name: N,
    payload: QueuePayloadInput<N>,
    options?: JobsOptions,
  ): Promise<string> {
    const data = parseQueuePayload(name, payload);
    const job = await this.queue(name).add(name, data, options);
    if (job.id === undefined) throw new Error(`queue ${name} returned a job without an id`);
    return job.id;
  }
}
