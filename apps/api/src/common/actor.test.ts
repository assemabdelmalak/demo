import { type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { actorKey, resolveActor, resolveClientIp } from './actor';

const SECRET = 'test-secret-test-secret-test-secret!!';

const request = (overrides: Partial<FastifyRequest> & { remoteAddress?: string } = {}) => {
  const { remoteAddress = '203.0.113.9', ...rest } = overrides;
  return {
    ip: remoteAddress,
    headers: {},
    socket: { remoteAddress },
    ...rest,
  } as unknown as FastifyRequest;
};

describe('resolveClientIp', () => {
  it('uses the socket address when no client IP header is configured, ignoring X-Forwarded-For', () => {
    const req = request({ headers: { 'x-forwarded-for': '6.6.6.6' } });
    expect(resolveClientIp(req, undefined)).toBe('203.0.113.9');
  });

  it('trusts only the configured header', () => {
    const req = request({
      remoteAddress: '172.18.0.5',
      headers: { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '6.6.6.6' },
    });
    expect(resolveClientIp(req, 'cf-connecting-ip')).toBe('198.51.100.7');
  });

  it('falls back to the socket when the header is missing or not an IP', () => {
    for (const value of [undefined, '', 'evil', '1.2.3.4, 5.6.7.8']) {
      const req = request({
        remoteAddress: '172.18.0.5',
        headers: value === undefined ? {} : { 'cf-connecting-ip': value },
      });
      expect(resolveClientIp(req, 'cf-connecting-ip')).toBe('172.18.0.5');
    }
  });

  it('groups IPv6 addresses by /64 and unwraps IPv4-mapped addresses', () => {
    const a = resolveClientIp(request({ remoteAddress: '2001:db8:1:2::1' }), undefined);
    const b = resolveClientIp(request({ remoteAddress: '2001:db8:1:2:ffff::8' }), undefined);
    const other = resolveClientIp(request({ remoteAddress: '2001:db8:1:3::1' }), undefined);
    expect(a).toBe(b);
    expect(a).not.toBe(other);
    expect(resolveClientIp(request({ remoteAddress: '::ffff:198.51.100.7' }), undefined)).toBe(
      '198.51.100.7',
    );
  });
});

describe('resolveActor', () => {
  it('prefers user, then participant, then device, then the resolved client IP', () => {
    expect(
      resolveActor(request({ principal: { userId: 'u', participantId: 'p', deviceId: 'd' } })),
    ).toEqual({
      kind: 'user',
      id: 'u',
    });
    expect(resolveActor(request({ principal: { participantId: 'p', deviceId: 'd' } }))).toEqual({
      kind: 'participant',
      id: 'p',
    });
    expect(resolveActor(request({ principal: { deviceId: 'd' } }))).toEqual({
      kind: 'device',
      id: 'd',
    });
    expect(resolveActor(request({ clientIp: '198.51.100.7' }))).toEqual({
      kind: 'ip',
      id: '198.51.100.7',
    });
  });
});

describe('actorKey', () => {
  it('is stable, kind-prefixed and does not contain the raw identifier', () => {
    const key = actorKey({ kind: 'ip', id: '203.0.113.9' }, SECRET);
    expect(key).toBe(actorKey({ kind: 'ip', id: '203.0.113.9' }, SECRET));
    expect(key.startsWith('ip:')).toBe(true);
    expect(key).not.toContain('203.0.113.9');
    expect(actorKey({ kind: 'device', id: '203.0.113.9' }, SECRET)).not.toBe(key);
  });

  it('depends on the secret, so key dumps cannot be reversed by hashing the IPv4 space', () => {
    expect(actorKey({ kind: 'ip', id: '203.0.113.9' }, `${SECRET}x`)).not.toBe(
      actorKey({ kind: 'ip', id: '203.0.113.9' }, SECRET),
    );
  });
});
