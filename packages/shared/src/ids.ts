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
