import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { detectIntegrationRuntime, type StartedService, startPostgres } from '@radd/config/testing';
import { uuidv7 } from '@radd/shared';

import { createDb, type DbHandle } from './client.js';
import {
  claimOutboxEvents,
  markClaimedOutboxEventsDispatched,
  OutboxRepository,
} from './outbox-queries.js';
import { currentTenantScope, withTenant } from './tenant.js';
import { createOrganization, createTestDatabase, type TestDatabase } from './testing/index.js';

const runtime = await detectIntegrationRuntime(['postgres']);

class Rollback extends Error {}

describe.skipIf(!runtime.ready)('outbox (ARCHITECTURE §8, ADR-028)', () => {
  let postgres: StartedService;
  let database: TestDatabase;
  let admin: DbHandle;
  let app: DbHandle;
  let worker: DbHandle;
  let orgA: string;
  let orgB: string;
  const outbox = new OutboxRepository();

  const event = (type = 'test.changed') => ({
    aggregateType: 'test',
    aggregateId: uuidv7(),
    type,
    payload: { version: 1 },
    rooms: ['restaurant:00000000-0000-7000-8000-000000000000:staff'],
  });

  /** When an event was dispatched (null: not yet; undefined: no such event), seen by the admin role. */
  const dispatchedAt = async (id: string) => {
    const { rows } = await admin.db.execute<{ dispatched_at: string | null }>(
      sql`select dispatched_at from outbox_events where id = ${id}::bigint`,
    );
    const row = rows[0];
    if (!row) return undefined;
    return row.dispatched_at === null ? null : new Date(row.dispatched_at);
  };

  /** Pretends the event was written `seconds` ago, past the API's fast path. */
  const age = (id: string, seconds: number) =>
    admin.db.execute(
      sql`update outbox_events set created_at = now() - make_interval(secs => ${seconds})
           where id = ${id}::bigint`,
    );

  beforeAll(async () => {
    postgres = await startPostgres();
    database = await createTestDatabase(postgres.url);
    admin = createDb({ url: database.urls.admin });
    app = createDb({ url: database.urls.runtime });
    worker = createDb({ url: database.urls.worker });
    orgA = (await createOrganization(admin.db)).id;
    orgB = (await createOrganization(admin.db)).id;
  });

  afterAll(async () => {
    await Promise.all([admin.close(), app.close(), worker.close()]);
    await database.drop();
    await postgres.stop();
  });

  describe('withTenant afterCommit', () => {
    it('runs queued work once the transaction has committed, in order', async () => {
      const seen: string[] = [];
      let id = '';
      await withTenant(app.db, orgA, async () => {
        id = (await outbox.add(event())).id;
        const queue = (label: string) => async () => {
          // Committed by now: a separate connection can see the row.
          seen.push(`${label}:${(await dispatchedAt(id)) === null ? 'visible' : 'missing'}`);
        };
        const scope = currentTenantScope();
        scope?.afterCommit(queue('first'));
        scope?.afterCommit(queue('second'));
        seen.push('body');
      });
      expect(seen).toEqual(['body', 'first:visible', 'second:visible']);
    });

    it('never runs it after a rollback', async () => {
      let ran = false;
      await withTenant(app.db, orgA, () => {
        currentTenantScope()?.afterCommit(async () => {
          ran = true;
          await Promise.resolve();
        });
        return Promise.reject(new Rollback());
      }).catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
      expect(ran).toBe(false);
    });

    it('does not turn a committed change into a failure when the work throws', async () => {
      const result = await withTenant(app.db, orgA, () => {
        currentTenantScope()?.afterCommit(() => Promise.reject(new Error('publish failed')));
        return Promise.resolve('committed');
      });
      expect(result).toBe('committed');
    });
  });

  describe('OutboxRepository', () => {
    it("adds an event under the tenant and marks only the tenant's own events", async () => {
      const a = await withTenant(app.db, orgA, () => outbox.add(event()));
      const b = await withTenant(app.db, orgB, () => outbox.add(event()));
      expect(a.organizationId).toBe(orgA);
      expect(a.rooms).toEqual(event().rooms);

      // B asks for both; RLS lets it mark only its own.
      expect(await withTenant(app.db, orgB, () => outbox.markDispatched([a.id, b.id]))).toBe(1);
      expect(await dispatchedAt(a.id)).toBeNull();
      expect(await dispatchedAt(b.id)).toBeInstanceOf(Date);
      // Marking again changes nothing.
      expect(await withTenant(app.db, orgB, () => outbox.markDispatched([b.id]))).toBe(0);
      expect(await withTenant(app.db, orgA, () => outbox.markDispatched([]))).toBe(0);
    });
  });

  describe('worker claim', () => {
    it('claims only undispatched events older than the minimum age, across organisations', async () => {
      const old = await withTenant(app.db, orgA, () => outbox.add(event('test.old')));
      const otherOrg = await withTenant(app.db, orgB, () => outbox.add(event('test.other')));
      const fresh = await withTenant(app.db, orgA, () => outbox.add(event('test.fresh')));
      await age(old.id, 10);
      await age(otherOrg.id, 10);

      const ids = await worker.db.transaction(async (tx) => {
        const claimed = await claimOutboxEvents(tx, { minAgeMs: 5_000, limit: 500 });
        const mine = claimed.filter((row) => [old.id, otherOrg.id, fresh.id].includes(row.id));
        expect(mine.map((row) => row.type).sort()).toEqual(['test.old', 'test.other']);
        expect(mine.find((row) => row.id === old.id)).toMatchObject({
          organizationId: orgA,
          aggregateType: 'test',
          payload: { version: 1 },
          rooms: event().rooms,
        });
        const marked = await markClaimedOutboxEventsDispatched(
          tx,
          mine.map((row) => row.id),
        );
        expect(marked).toBe(2);
        return mine.map((row) => row.id);
      });

      for (const id of ids) expect(await dispatchedAt(id)).toBeInstanceOf(Date);
      expect(await dispatchedAt(fresh.id)).toBeNull();
    });

    it('never hands the same event to two dispatchers at once (SKIP LOCKED)', async () => {
      const row = await withTenant(app.db, orgA, () => outbox.add(event('test.contended')));
      await age(row.id, 10);
      const claimedBy = async (tx: Parameters<Parameters<typeof worker.db.transaction>[0]>[0]) =>
        (await claimOutboxEvents(tx, { minAgeMs: 5_000, limit: 500 })).some(
          (claimed) => claimed.id === row.id,
        );

      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let signalClaimed: () => void = () => undefined;
      const claimedFirst = new Promise<void>((resolve) => {
        signalClaimed = resolve;
      });
      let first = false;
      const firstDone = worker.db.transaction(async (tx) => {
        first = await claimedBy(tx);
        signalClaimed();
        await held;
        throw new Rollback();
      });
      // The first dispatcher holds its lock until released.
      await claimedFirst;
      const second = await worker.db.transaction((tx) => claimedBy(tx));
      release();
      await firstDone.catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });

      expect(first).toBe(true);
      expect(second).toBe(false);
      // Rolled back: the event is still there for the next run.
      expect(await worker.db.transaction((tx) => claimedBy(tx))).toBe(true);
    });

    it('keeps the first dispatch time when the API marked an event first', async () => {
      const row = await withTenant(app.db, orgA, () => outbox.add(event()));
      await withTenant(app.db, orgA, () => outbox.markDispatched([row.id]));
      const first = await dispatchedAt(row.id);
      expect(
        await worker.db.transaction((tx) => markClaimedOutboxEventsDispatched(tx, [row.id])),
      ).toBe(0);
      expect(await dispatchedAt(row.id)).toEqual(first);
      expect(await worker.db.transaction((tx) => markClaimedOutboxEventsDispatched(tx, []))).toBe(
        0,
      );
    });
  });
});
