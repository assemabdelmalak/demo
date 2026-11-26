import { z } from 'zod';

// Realtime notifications (ARCHITECTURE §8, ADR-028). Postgres is the source of truth: an event
// only tells a client that something changed; the client then reads the REST snapshot. Delivery
// is at least once, so listeners de-duplicate by `eventId`. The Socket.IO gateway that delivers
// these to browsers arrives in P4-T03; until then events reach Valkey only.

/** Socket.IO namespaces: diners authenticate with a participant token, staff with a session. */
export const REALTIME_NAMESPACES = ['/diner', '/staff'] as const;
export type RealtimeNamespace = (typeof REALTIME_NAMESPACES)[number];

/** Room names, built only here so producers and the gateway agree on them. */
export const realtimeRooms = {
  session: (sessionId: string) => `session:${sessionId}`,
  restaurantPublic: (restaurantId: string) => `restaurant:${restaurantId}:public`,
  restaurantStaff: (restaurantId: string) => `restaurant:${restaurantId}:staff`,
  restaurantKitchen: (restaurantId: string) => `restaurant:${restaurantId}:kitchen`,
  organizationImports: (organizationId: string) => `org:${organizationId}:imports`,
} as const;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Which namespaces each kind of room lives in. A staff or kitchen room is never emitted on the
 * diner namespace, so a diner socket could not receive its events even if it joined a room of
 * that name.
 */
const ROOM_NAMESPACES: readonly { pattern: RegExp; namespaces: readonly RealtimeNamespace[] }[] = [
  { pattern: new RegExp(`^session:${UUID}$`), namespaces: ['/diner', '/staff'] },
  { pattern: new RegExp(`^restaurant:${UUID}:public$`), namespaces: ['/diner'] },
  { pattern: new RegExp(`^restaurant:${UUID}:(staff|kitchen)$`), namespaces: ['/staff'] },
  { pattern: new RegExp(`^org:${UUID}:imports$`), namespaces: ['/staff'] },
];

/** The namespaces a room is emitted on; undefined for a name that is not a known room. */
export function namespacesForRoom(room: string): readonly RealtimeNamespace[] | undefined {
  return ROOM_NAMESPACES.find(({ pattern }) => pattern.test(room))?.namespaces;
}

export const realtimeRoomSchema = z
  .string()
  .max(100)
  .refine((room) => namespacesForRoom(room) !== undefined, { message: 'Unknown realtime room' });

/** Dotted lower-case names, e.g. `session.updated`; never one of Socket.IO's reserved events. */
export const realtimeEventTypeSchema = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'Event types look like `session.updated`');

/** Notifications stay small: clients fetch the state itself from the REST snapshot. */
export const MAX_REALTIME_PAYLOAD_BYTES = 8_192;

const payloadSchema = z
  .record(z.string(), z.unknown())
  .refine((payload) => JSON.stringify(payload).length <= MAX_REALTIME_PAYLOAD_BYTES, {
    message: `Payload over ${String(MAX_REALTIME_PAYLOAD_BYTES)} bytes`,
  });

/** What a mutation puts in the outbox, in the same transaction as the change. */
export const outboxEventInputSchema = z.strictObject({
  type: realtimeEventTypeSchema,
  aggregate: z.strictObject({
    type: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(50),
    id: z.uuid(),
  }),
  rooms: z.array(realtimeRoomSchema).min(1).max(10),
  payload: payloadSchema,
});
export type OutboxEventInput = z.input<typeof outboxEventInputSchema>;

/** What every listener receives, on every room the event names. */
export const realtimeEnvelopeSchema = z.strictObject({
  /** The outbox row's ID: the same event re-emitted by the worker has the same one. */
  eventId: z.string().regex(/^\d+$/),
  type: realtimeEventTypeSchema,
  aggregate: z.strictObject({ type: z.string(), id: z.uuid() }),
  occurredAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
});
export type RealtimeEnvelope = z.infer<typeof realtimeEnvelopeSchema>;

export interface RealtimeEvent {
  rooms: readonly string[];
  envelope: RealtimeEnvelope;
}

/** A stored outbox event, as the API's fast path and the worker both emit it. */
export interface StoredOutboxEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  rooms: readonly string[];
  createdAt: Date;
}

export function realtimeEventFromOutbox(row: StoredOutboxEvent): RealtimeEvent {
  return {
    rooms: row.rooms,
    envelope: {
      eventId: row.id,
      type: row.type,
      aggregate: { type: row.aggregateType, id: row.aggregateId },
      occurredAt: row.createdAt.toISOString(),
      payload: row.payload,
    },
  };
}
