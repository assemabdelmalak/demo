import { v7, validate, version } from 'uuid';

/** Time-ordered UUIDv7, generated in the app for every primary key and request ID (CLAUDE §7). */
export function uuidv7(): string {
  return v7();
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && validate(value);
}

export function isUuidV7(value: unknown): value is string {
  return isUuid(value) && version(value) === 7;
}

/** Correlates one request across the Next.js servers, the API and the logs (P0-T09). */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Keeps a caller-supplied UUID so one ID follows a request across services; anything else is
 * replaced with a fresh UUIDv7, which also keeps attacker-controlled text out of the logs.
 */
export function normalizeRequestId(value: unknown): string {
  return isUuid(value) ? value : uuidv7();
}
