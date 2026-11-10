import { UnrecoverableError, type Job } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { isFinalFailure } from './reporting-worker-host';

const job = (attemptsMade: number, attempts?: number) =>
  ({ attemptsMade, opts: attempts === undefined ? {} : { attempts } }) as Job;

describe('isFinalFailure', () => {
  it('waits for the last attempt before calling a failure final', () => {
    expect(isFinalFailure(job(1, 3), new Error('transient'))).toBe(false);
    expect(isFinalFailure(job(2, 3), new Error('transient'))).toBe(false);
    expect(isFinalFailure(job(3, 3), new Error('transient'))).toBe(true);
  });

  it('treats a job without retries as final on its first failure', () => {
    expect(isFinalFailure(job(1), new Error('x'))).toBe(true);
  });

  it('is final at once for UnrecoverableError, including copies matched by name', () => {
    expect(isFinalFailure(job(1, 3), new UnrecoverableError('bad payload'))).toBe(true);
    const copy = Object.assign(new Error('bad payload'), { name: 'UnrecoverableError' });
    expect(isFinalFailure(job(1, 3), copy)).toBe(true);
  });

  it('is final when BullMQ has no job to report', () => {
    expect(isFinalFailure(undefined, new Error('x'))).toBe(true);
  });
});
