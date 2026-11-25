import { and, inArray, isNull, sql } from 'drizzle-orm';

import { type DbExecutor } from './client.js';
import { outboxEvents } from './schema/platform.js';
import { BaseTenantRepository } from './tenant.js';

// Transactional outbox (ARCHITECTURE §8, ADR-028). The API writes an event in the same tenant
// transaction as the change and marks it dispatched after its post-commit publish; the worker
// re-emits whatever is left through the `claim_outbox_events` / `mark_outbox_events_dispatched`
// definer functions, which only `app_worker` may call. IDs cross this boundary as strings: they
// are bigints in the database and must survive JSON.

export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  type: string;
  payload: Record<string, unknown>;
  rooms: readonly string[];
}

export interface OutboxEventRow {
  id: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  type: string;
  payload: Record<string, unknown>;
  rooms: string[];
  createdAt: Date;
}

const columns = {
  id: outboxEvents.id,
  organizationId: outboxEvents.organizationId,
  aggregateType: outboxEvents.aggregateType,
  aggregateId: outboxEvents.aggregateId,
  type: outboxEvents.type,
  payload: outboxEvents.payload,
  rooms: outboxEvents.room,
  createdAt: outboxEvents.createdAt,
};

/** The current tenant's outbox. RLS confines both methods to that organisation. */
export class OutboxRepository extends BaseTenantRepository {
  async add(event: OutboxEventInput): Promise<OutboxEventRow> {
    const [row] = await this.tx
      .insert(outboxEvents)
      .values({
        organizationId: this.organizationId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        type: event.type,
        payload: event.payload,
        room: [...event.rooms],
      })
      .returning(columns);
    if (!row) throw new Error('outbox insert returned no row');
    return { ...row, id: row.id.toString() };
  }

  /** Sets `dispatched_at` on those still undispatched; returns how many it set. */
  async markDispatched(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const marked = await this.tx
      .update(outboxEvents)
      .set({ dispatchedAt: sql`clock_timestamp()` })
      .where(
        and(
          inArray(
            outboxEvents.id,
            ids.map((id) => BigInt(id)),
          ),
          isNull(outboxEvents.dispatchedAt),
        ),
      )
      .returning({ id: outboxEvents.id });
    return marked.length;
  }
}

export interface ClaimOutboxOptions {
  /** Only events at least this old; younger ones are still the API's to publish. */
  minAgeMs: number;
  /** At most this many (the function caps it at 500). */
  limit: number;
}

/**
 * Worker only. Locks and returns undispatched events of every organisation, oldest first, for the
 * rest of `tx`: emit them, mark them with `markClaimedOutboxEventsDispatched`, then commit.
 */
export async function claimOutboxEvents(
  tx: DbExecutor,
  { minAgeMs, limit }: ClaimOutboxOptions,
): Promise<OutboxEventRow[]> {
  const result = await tx.execute<{
    id: string;
    organization_id: string;
    aggregate_type: string;
    aggregate_id: string;
    type: string;
    payload: Record<string, unknown>;
    room: string[];
    created_at: Date | string;
  }>(sql`select id::text as id, organization_id, aggregate_type, aggregate_id, type, payload,
                room, created_at
           from claim_outbox_events(make_interval(secs => ${minAgeMs / 1000}), ${limit})`);
  return result.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    type: row.type,
    payload: row.payload,
    rooms: row.room,
    createdAt: new Date(row.created_at),
  }));
}

/** Worker only. Marks claimed events dispatched; returns how many were still undispatched. */
export async function markClaimedOutboxEventsDispatched(
  tx: DbExecutor,
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  // One array parameter (`{1,2,3}`), not a list Drizzle would expand into `($1, $2, $3)`.
  const literal = `{${ids.map((id) => BigInt(id).toString()).join(',')}}`;
  const result = await tx.execute<{ marked: number }>(
    sql`select mark_outbox_events_dispatched(${literal}::bigint[]) as marked`,
  );
  return result.rows[0]?.marked ?? 0;
}
