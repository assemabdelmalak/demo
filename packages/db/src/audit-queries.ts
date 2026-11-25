import { type ActorType } from '@radd/shared';

import { type DbExecutor } from './client.js';
import { auditLogs } from './schema/platform.js';

/** One audit entry as stored (DATA_MODEL §10). The IP is only ever stored as a keyed hash. */
export interface AuditLogInsert {
  /** Null for platform events that belong to no organisation (Bull Board, sign-in). */
  organizationId: string | null;
  restaurantId: string | null;
  actorType: ActorType;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipHash: string | null;
  requestId: string | null;
}

/**
 * Appends one entry in the caller's transaction, so it commits or rolls back with the change it
 * describes. RLS (`audit_append`) accepts the current tenant's organisation, or no organisation
 * when no tenant is set; the admin pool bypasses it. No RETURNING: an entry without an
 * organisation is not readable back by the runtime role, and nothing needs the generated ID.
 */
export async function insertAuditLog(db: DbExecutor, entry: AuditLogInsert): Promise<void> {
  await db.insert(auditLogs).values(entry);
}
