-- Hand-written (ADR-022, ADR-026). A shared tablet's cookie must be resolved to its device, and so
-- to its organisation, before any tenant context exists: the PIN switch and every request of a
-- PIN session need it. A narrow SECURITY DEFINER function returns that device's identity and
-- revocation, looked up by the SHA-256 of the token, and nothing else. Only the API calls it; the
-- worker never sees device cookies.
CREATE OR REPLACE FUNCTION staff_device_by_token_hash(target_token_hash text)
  RETURNS TABLE (id uuid, organization_id uuid, restaurant_id uuid, revoked_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  BEGIN ATOMIC
    SELECT d.id, d.organization_id, d.restaurant_id, d.revoked_at
      FROM staff_devices d
     WHERE d.token_hash = target_token_hash;
  END;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION staff_device_by_token_hash(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION staff_device_by_token_hash(text) TO app_runtime;
