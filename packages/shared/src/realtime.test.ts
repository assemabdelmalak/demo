import { decode } from 'notepack.io';
import { describe, expect, it } from 'vitest';

import { RedisEmitterPublisher, type RedisPublishClient } from './realtime-publisher.js';
import {
  MAX_REALTIME_PAYLOAD_BYTES,
  namespacesForRoom,
  outboxEventInputSchema,
  realtimeEnvelopeSchema,
  realtimeEventFromOutbox,
  realtimeRooms,
} from './realtime.js';

const ID = '0199f2a4-5b6c-7d8e-9f01-23456789abcd';

describe('realtime rooms', () => {
  it('maps every room kind to its namespaces, and staff rooms never to the diner one', () => {
    expect(namespacesForRoom(realtimeRooms.session(ID))).toEqual(['/diner', '/staff']);
    expect(namespacesForRoom(realtimeRooms.restaurantPublic(ID))).toEqual(['/diner']);
    expect(namespacesForRoom(realtimeRooms.restaurantStaff(ID))).toEqual(['/staff']);
    expect(namespacesForRoom(realtimeRooms.restaurantKitchen(ID))).toEqual(['/staff']);
    expect(namespacesForRoom(realtimeRooms.organizationImports(ID))).toEqual(['/staff']);
  });

  it('knows no other room', () => {
    for (const room of [
      'session:not-a-uuid',
      `restaurant:${ID}:admin`,
      `restaurant:${ID}`,
      `session:${ID}:extra`,
      `SESSION:${ID}`,
      '',
    ]) {
      expect(namespacesForRoom(room), room).toBeUndefined();
    }
  });
});

describe('outboxEventInputSchema', () => {
  const valid = {
    type: 'session.updated',
    aggregate: { type: 'session', id: ID },
    rooms: [realtimeRooms.session(ID)],
    payload: { sessionVersion: 3 },
  };

  it('accepts a well-formed event', () => {
    expect(outboxEventInputSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['an undotted type', { ...valid, type: 'updated' }],
    ['a reserved Socket.IO event', { ...valid, type: 'connect' }],
    ['an unknown room', { ...valid, rooms: ['everyone'] }],
    ['no room', { ...valid, rooms: [] }],
    ['an aggregate without a UUID', { ...valid, aggregate: { type: 'session', id: '42' } }],
    ['a stray field', { ...valid, organizationId: ID }],
    [
      'a payload too big to be a notification',
      { ...valid, payload: { blob: 'x'.repeat(MAX_REALTIME_PAYLOAD_BYTES) } },
    ],
  ])('refuses %s', (_label, input) => {
    expect(outboxEventInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('realtimeEventFromOutbox', () => {
  it('builds the envelope listeners receive', () => {
    const event = realtimeEventFromOutbox({
      id: '42',
      type: 'session.updated',
      aggregateType: 'session',
      aggregateId: ID,
      payload: { sessionVersion: 3 },
      rooms: [realtimeRooms.session(ID)],
      createdAt: new Date('2026-11-25T10:00:00.000Z'),
    });
    expect(event).toEqual({
      rooms: [`session:${ID}`],
      envelope: {
        eventId: '42',
        type: 'session.updated',
        aggregate: { type: 'session', id: ID },
        occurredAt: '2026-11-25T10:00:00.000Z',
        payload: { sessionVersion: 3 },
      },
    });
    expect(realtimeEnvelopeSchema.parse(event.envelope)).toEqual(event.envelope);
  });
});

describe('RedisEmitterPublisher', () => {
  const event = realtimeEventFromOutbox({
    id: '7',
    type: 'session.updated',
    aggregateType: 'session',
    aggregateId: ID,
    payload: { sessionVersion: 1 },
    rooms: [realtimeRooms.session(ID), realtimeRooms.restaurantStaff(ID)],
    createdAt: new Date('2026-11-25T10:00:00.000Z'),
  });

  class RecordingClient implements RedisPublishClient {
    readonly messages: { channel: string; message: unknown }[] = [];
    constructor(private readonly fail = false) {}

    publish(channel: string, message: Buffer | string): Promise<unknown> {
      if (this.fail) return Promise.reject(new Error('Connection is closed.'));
      this.messages.push({ channel, message: decode(message) });
      return Promise.resolve(1);
    }
  }

  it('emits each room on its own namespaces, in the Socket.IO adapter format', async () => {
    const redis = new RecordingClient();
    await new RedisEmitterPublisher(redis).publish(event);
    expect(redis.messages).toEqual([
      // One room in the namespace: the adapter's per-room channel.
      {
        channel: `socket.io#/diner#session:${ID}#`,
        message: [
          'emitter',
          { type: 2, data: ['session.updated', event.envelope], nsp: '/diner' },
          { rooms: [`session:${ID}`], flags: {}, except: [] },
        ],
      },
      // Several rooms: the namespace channel, with the rooms in the options.
      {
        channel: 'socket.io#/staff#',
        message: [
          'emitter',
          { type: 2, data: ['session.updated', event.envelope], nsp: '/staff' },
          { rooms: [`session:${ID}`, `restaurant:${ID}:staff`], flags: {}, except: [] },
        ],
      },
    ]);
  });

  it('rejects when Valkey refuses a message, instead of losing it', async () => {
    await expect(
      new RedisEmitterPublisher(new RecordingClient(true)).publish(event),
    ).rejects.toThrow('Connection is closed.');
  });

  it('refuses a room it does not know before sending anything', async () => {
    const redis = new RecordingClient();
    await expect(
      new RedisEmitterPublisher(redis).publish({ ...event, rooms: ['everyone'] }),
    ).rejects.toThrow('unknown room');
    expect(redis.messages).toEqual([]);
  });
});
