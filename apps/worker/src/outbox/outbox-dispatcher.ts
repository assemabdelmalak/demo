import { Inject, Injectable, Logger } from '@nestjs/common';
import { captureException } from '@sentry/node';

import {
  claimOutboxEvents,
  type DbHandle,
  markClaimedOutboxEventsDispatched,
  type OutboxEventRow,
} from '@radd/db';
import { namespacesForRoom, realtimeEventFromOutbox, realtimeEventTypeSchema } from '@radd/shared';
import { type RealtimePublisher } from '@radd/shared/realtime-publisher';

import { WORKER_DB } from '../db/db.module';

/** Injection tokens of the worker's publisher and the dispatcher's settings. */
export const WORKER_REALTIME = Symbol('WORKER_REALTIME');
export const OUTBOX_DISPATCH_OPTIONS = Symbol('OUTBOX_DISPATCH_OPTIONS');

export interface OutboxDispatchOptions {
  /** How often the scheduler runs a dispatch (ARCHITECTURE §8: 5 s). */
  everyMs: number;
  /** Events younger than this are still the API's to publish (5 s). */
  minAgeMs: number;
  /** Events claimed per transaction. */
  batchSize: number;
  /** Upper bound on batches per run, so one run cannot hold the queue for long. */
  maxBatches: number;
}

export const DEFAULT_OUTBOX_DISPATCH: OutboxDispatchOptions = {
  everyMs: 5_000,
  minAgeMs: 5_000,
  batchSize: 200,
  maxBatches: 10,
};

export interface DispatchResult {
  claimed: number;
  dispatched: number;
  /** Events that can never be delivered (unknown room or type); logged and set aside. */
  undeliverable: number;
}

/** The checks `OutboxService.add` applies, for rows written before a rule changed. */
function isDeliverable(row: OutboxEventRow): boolean {
  return (
    realtimeEventTypeSchema.safeParse(row.type).success &&
    row.rooms.length > 0 &&
    row.rooms.every((room) => namespacesForRoom(room) !== undefined)
  );
}

/**
 * Re-emits outbox events the API did not mark dispatched within `minAgeMs` (ADR-028): Valkey was
 * down, or the API stopped between commit and emit. Each batch is claimed, emitted in order and
 * marked in one transaction, so a crash here leaves the rest claimed by nobody and the next run
 * picks them up. Listeners de-duplicate by event ID, since an event can arrive twice.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);

  constructor(
    @Inject(WORKER_DB) private readonly handle: DbHandle,
    @Inject(WORKER_REALTIME) private readonly publisher: RealtimePublisher,
    @Inject(OUTBOX_DISPATCH_OPTIONS) private readonly options: OutboxDispatchOptions,
  ) {}

  async run(): Promise<DispatchResult> {
    const total: DispatchResult = { claimed: 0, dispatched: 0, undeliverable: 0 };
    for (let batch = 0; batch < this.options.maxBatches; batch += 1) {
      const { claimed, sent, undeliverable, failure } = await this.handle.db.transaction(
        async (tx) => {
          const rows = await claimOutboxEvents(tx, {
            minAgeMs: this.options.minAgeMs,
            limit: this.options.batchSize,
          });
          const done: string[] = [];
          let skipped = 0;
          let error: unknown;
          for (const row of rows) {
            if (!isDeliverable(row)) {
              // It would block every event behind it forever; set it aside and say so loudly.
              this.reportUndeliverable(row);
              done.push(row.id);
              skipped += 1;
              continue;
            }
            try {
              await this.publisher.publish(realtimeEventFromOutbox(row));
              done.push(row.id);
            } catch (caught) {
              // Stop here: what follows must not overtake it. It stays undispatched.
              error = caught;
              break;
            }
          }
          // Rows the API marked meanwhile keep their first timestamp.
          await markClaimedOutboxEventsDispatched(tx, done);
          return {
            claimed: rows.length,
            sent: done.length - skipped,
            undeliverable: skipped,
            failure: error,
          };
        },
      );
      total.claimed += claimed;
      total.dispatched += sent;
      total.undeliverable += undeliverable;
      // Thrown after the commit, so what was sent stays marked; the next run retries the rest.
      if (failure !== undefined) {
        throw new Error(`outbox publish failed after ${String(total.dispatched)} events`, {
          cause: failure,
        });
      }
      if (claimed < this.options.batchSize) break;
    }
    if (total.claimed > 0) this.logger.log(total, 'outbox events re-emitted');
    return total;
  }

  private reportUndeliverable(row: OutboxEventRow): void {
    // The ID and type only: the payload may hold diner content.
    this.logger.error({ eventId: row.id, type: row.type }, 'undeliverable outbox event set aside');
    captureException(new Error('undeliverable outbox event'), {
      tags: { outboxEventType: row.type },
      extra: { eventId: row.id },
    });
  }
}
