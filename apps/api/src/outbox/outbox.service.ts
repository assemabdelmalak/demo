import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  currentTenantScope,
  type DbHandle,
  type DbTransaction,
  type OutboxEventRow,
  OutboxRepository,
  withTenant,
} from '@radd/db';
import {
  type OutboxEventInput,
  outboxEventInputSchema,
  realtimeEventFromOutbox,
} from '@radd/shared';
import { type RealtimePublisher } from '@radd/shared/realtime-publisher';

import { DB } from '../db/db.module';

/** Injection token of the `RealtimePublisher` port (ADR-028). */
export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');

/**
 * The transactional outbox (ARCHITECTURE §8, ADR-028). `add` writes the event in the caller's
 * tenant transaction, so it exists exactly when the change does. Once that transaction has
 * committed, the events are emitted in the order they were added and marked dispatched: the fast
 * path. Whatever is not marked (Valkey down, the process killed between commit and emit) is
 * re-emitted by the worker's `outbox.dispatch` job after 5 seconds, so delivery is at least once.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  /** Events waiting for their transaction to commit; one publish per transaction. */
  private readonly pending = new WeakMap<DbTransaction, OutboxEventRow[]>();

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(REALTIME_PUBLISHER) private readonly publisher: RealtimePublisher,
    private readonly outbox: OutboxRepository,
  ) {}

  /** Adds an event to `tx`, which must be the current tenant transaction. Returns its ID. */
  async add(tx: DbTransaction, event: OutboxEventInput): Promise<string> {
    const scope = currentTenantScope();
    // The publish is tied to the tenant scope's commit: any other transaction would publish
    // events that might still roll back, or never publish them.
    if (scope?.tx !== tx) throw new Error('OutboxService.add needs the current tenant transaction');
    const input = outboxEventInputSchema.parse(event);
    const row = await this.outbox.add({
      aggregateType: input.aggregate.type,
      aggregateId: input.aggregate.id,
      type: input.type,
      payload: input.payload,
      rooms: input.rooms,
    });

    let queued = this.pending.get(tx);
    if (!queued) {
      const rows: OutboxEventRow[] = [];
      queued = rows;
      this.pending.set(tx, rows);
      scope.afterCommit(() => this.publish(scope.organizationId, rows));
    }
    queued.push(row);
    return row.id;
  }

  /**
   * After commit. Stops at the first failure so events are never emitted out of order; the
   * worker sends the rest. Never throws: the change is durable whatever happens here.
   */
  async publish(organizationId: string, rows: readonly OutboxEventRow[]): Promise<void> {
    const sent: string[] = [];
    for (const row of rows) {
      try {
        await this.publisher.publish(realtimeEventFromOutbox(row));
        sent.push(row.id);
      } catch (error) {
        this.logger.warn(
          { err: error, eventId: row.id, type: row.type },
          'realtime publish failed; the outbox worker will re-emit',
        );
        break;
      }
    }
    if (sent.length === 0) return;
    try {
      await withTenant(this.handle.db, organizationId, () => this.outbox.markDispatched(sent));
    } catch (error) {
      // Emitted but not marked: the worker emits these again, which listeners de-duplicate.
      this.logger.warn({ err: error, events: sent.length }, 'could not mark outbox events');
    }
  }
}
