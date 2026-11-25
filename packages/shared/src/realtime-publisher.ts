import { Emitter } from '@socket.io/redis-emitter';

import { namespacesForRoom, type RealtimeEvent, type RealtimeNamespace } from './realtime.js';

// Node servers only (the API and the worker); never imported by the browser apps.

/** The port both the API's post-commit publish and the worker's re-emit go through (ADR-028). */
export interface RealtimePublisher {
  /** Resolves once Valkey accepted every message; rejects if any was not sent. */
  publish(event: RealtimeEvent): Promise<void>;
}

/** The one method of an ioredis client the emitter uses. */
export interface RedisPublishClient {
  publish(channel: string, message: Buffer | string): Promise<unknown>;
}

/**
 * Emits through `@socket.io/redis-emitter`, which the Socket.IO gateway's Redis adapter (P4-T03)
 * receives on the same channels. Each room is emitted on its own namespaces only
 * (`namespacesForRoom`).
 *
 * The emitter calls `publish` and drops the promise, so a failed publish would go unnoticed (and
 * the outbox row be marked dispatched anyway) and surface as an unhandled rejection. The client
 * it is given here records every promise, and `publish` awaits them all.
 */
export class RedisEmitterPublisher implements RealtimePublisher {
  constructor(private readonly redis: RedisPublishClient) {}

  async publish({ rooms, envelope }: RealtimeEvent): Promise<void> {
    const byNamespace = new Map<RealtimeNamespace, string[]>();
    for (const room of rooms) {
      const namespaces = namespacesForRoom(room);
      if (!namespaces) throw new Error(`event ${envelope.eventId} names an unknown room`);
      for (const namespace of namespaces) {
        const list = byNamespace.get(namespace) ?? [];
        list.push(room);
        byNamespace.set(namespace, list);
      }
    }

    const sent: Promise<unknown>[] = [];
    const client: RedisPublishClient = {
      publish: (channel, message) => {
        const promise = this.redis.publish(channel, message);
        sent.push(promise);
        return promise;
      },
    };
    const emitter = new Emitter(client);
    for (const [namespace, namespaceRooms] of byNamespace) {
      emitter.of(namespace).to(namespaceRooms).emit(envelope.type, envelope);
    }
    await Promise.all(sent);
  }
}
