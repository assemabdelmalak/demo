/**
 * What a mutation will hand `AuditService.record` once it exists (P1-T07): the entity, its state
 * before and after. Actor, organisation, request ID and IP hash are added there from the request
 * context, inside the same transaction as the change.
 */
export interface PendingAuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  organizationId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * The seam every mutation calls today. P1-T07 replaces each call with `AuditService.record` in
 * the request's transaction; until then nothing is written. Kept as one greppable function
 * (`recordAuditLater`) so no mutation is missed when the service arrives.
 */
export function recordAuditLater(_entry: PendingAuditEntry): void {
  // Intentionally empty until P1-T07.
}
