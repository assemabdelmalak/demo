import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { captureException } from '@sentry/node';
import { type Job } from 'bullmq';

/**
 * BullMQ emits `failed` after every attempt, with `attemptsMade` already counting this one. A job
 * is finished when it used its last attempt or threw UnrecoverableError (matched by name, as
 * BullMQ does, so errors from another copy of the class count too).
 */
export function isFinalFailure(job: Job | undefined, error: Error): boolean {
  if (error.name === 'UnrecoverableError' || job === undefined) return true;
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

/**
 * Base class for every processor. Retries are expected, so only a job's final failure is logged
 * at error level and sent to Sentry. Job data is never attached: it can hold diner content.
 */
export abstract class ReportingWorkerHost extends WorkerHost {
  private readonly failureLogger = new Logger('JobFailure');

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    if (!isFinalFailure(job, error)) return;
    const queue = job?.queueName ?? 'unknown';
    const jobName = job?.name ?? 'unknown';
    this.failureLogger.error(
      { err: error, queue, jobName, jobId: job?.id, attemptsMade: job?.attemptsMade },
      'job failed permanently',
    );
    captureException(error, { tags: { queue, jobName }, extra: { jobId: job?.id } });
  }
}
