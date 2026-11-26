-- Hand-written (ADR-022, ADR-028). The worker's `outbox.dispatch` job re-emits events the API did
-- not mark dispatched after commit, across every organisation. The worker role has no privilege
-- on `outbox_events` itself; these two narrow SECURITY DEFINER functions are all it can do with
-- it, and only the worker may call them, so the API role can never read another tenant's events.

-- Locks and returns up to `max_events` undispatched events at least `min_age` old, oldest first.
-- `SKIP LOCKED`: two dispatchers never claim the same row, and a row the API is marking right now
-- is left to it. The locks last until the caller's transaction ends, so the caller emits, marks
-- and commits in one transaction.
CREATE OR REPLACE FUNCTION claim_outbox_events(min_age interval, max_events integer)
  RETURNS TABLE (
    id bigint,
    organization_id uuid,
    aggregate_type text,
    aggregate_id uuid,
    type text,
    payload jsonb,
    room text[],
    created_at timestamptz
  )
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  BEGIN ATOMIC
    SELECT e.id, e.organization_id, e.aggregate_type, e.aggregate_id, e.type, e.payload, e.room,
           e.created_at
      FROM outbox_events e
     WHERE e.dispatched_at IS NULL
       AND e.created_at <= now() - greatest(min_age, interval '0')
     ORDER BY e.created_at, e.id
     LIMIT least(greatest(max_events, 1), 500)
       FOR UPDATE SKIP LOCKED;
  END;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION claim_outbox_events(interval, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_outbox_events(interval, integer) TO app_worker;
--> statement-breakpoint

-- Marks the given events dispatched; returns how many were still undispatched. An event already
-- marked (by the API's fast path) keeps its first timestamp.
CREATE OR REPLACE FUNCTION mark_outbox_events_dispatched(event_ids bigint[]) RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  BEGIN ATOMIC
    WITH marked AS (
      UPDATE outbox_events o
         SET dispatched_at = clock_timestamp()
       WHERE o.id = ANY (event_ids) AND o.dispatched_at IS NULL
      RETURNING 1
    )
    SELECT count(*)::integer FROM marked;
  END;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION mark_outbox_events_dispatched(bigint[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mark_outbox_events_dispatched(bigint[]) TO app_worker;
