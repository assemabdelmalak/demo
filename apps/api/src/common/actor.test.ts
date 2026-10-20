import { type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { actorKey, resolveActor } from './actor';

const request = (principal?: FastifyRequest['principal']) =>
  ({ ip: '203.0.113.9', principal }) as unknown as FastifyRequest;

describe('resolveActor', () => {
  it('prefers user, then participant, then device, then IP', () => {
    expect(resolveActor(request({ userId: 'u', participantId: 'p', deviceId: 'd' }))).toEqual({
      kind: 'user',
      id: 'u',
    });
    expect(resolveActor(request({ participantId: 'p', deviceId: 'd' }))).toEqual({
      kind: 'participant',
      id: 'p',
    });
    expect(resolveActor(request({ deviceId: 'd' }))).toEqual({ kind: 'device', id: 'd' });
    expect(resolveActor(request())).toEqual({ kind: 'ip', id: '203.0.113.9' });
  });
});

describe('actorKey', () => {
  it('is stable, kind-prefixed and does not contain the raw identifier', () => {
    const key = actorKey({ kind: 'ip', id: '203.0.113.9' });
    expect(key).toBe(actorKey({ kind: 'ip', id: '203.0.113.9' }));
    expect(key.startsWith('ip:')).toBe(true);
    expect(key).not.toContain('203.0.113.9');
    expect(actorKey({ kind: 'device', id: '203.0.113.9' })).not.toBe(key);
  });
});
