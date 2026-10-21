import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

import { DEFAULT_IPV6_SUBNET_PREFIX, normalizeIp } from '@nestjs/throttler';
import { type FastifyRequest } from 'fastify';

/**
 * Who is calling. Auth arrives in P1 (users) and P4 (devices, participants); it must set this in a
 * Fastify `onRequest`/`preHandler` hook, because the global throttler guard runs before any
 * controller-level guard and reads it (ADR-016).
 */
export interface RequestPrincipal {
  userId?: string;
  participantId?: string;
  deviceId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: RequestPrincipal;
    /** Resolved once per request by `resolveClientIp`; IPv6 is grouped by /64. */
    clientIp?: string;
  }
}

export interface Actor {
  kind: 'user' | 'participant' | 'device' | 'ip';
  id: string;
}

/**
 * The caller's IP. Forwarding headers are client-controlled (Cloudflare appends to a spoofed
 * X-Forwarded-For), so only a single header that the edge overwrites is trusted, and only when
 * configured: `CLIENT_IP_HEADER=cf-connecting-ip` behind Cloudflare. IPv6 addresses collapse to
 * their /64 so one host cannot rotate through its own prefix to dodge limits.
 */
export function resolveClientIp(req: FastifyRequest, clientIpHeader: string | undefined): string {
  const fromHeader = clientIpHeader ? req.headers[clientIpHeader] : undefined;
  const candidate = typeof fromHeader === 'string' ? fromHeader.trim() : '';
  const ip = isIP(candidate) ? candidate : (req.socket.remoteAddress ?? req.ip);
  return normalizeIp(ip, DEFAULT_IPV6_SUBNET_PREFIX);
}

/**
 * Most specific identity first. Diners share restaurant Wi-Fi, so IP is only the fallback for
 * requests that carry no identity yet (CLAUDE §3.7).
 */
export function resolveActor(req: FastifyRequest): Actor {
  const principal = req.principal;
  if (principal?.userId) return { kind: 'user', id: principal.userId };
  if (principal?.participantId) return { kind: 'participant', id: principal.participantId };
  if (principal?.deviceId) return { kind: 'device', id: principal.deviceId };
  return { kind: 'ip', id: req.clientIp ?? req.ip };
}

/**
 * Key fragment for Valkey. Keyed HMAC rather than a bare hash: the IPv4 space is small enough to
 * reverse an unkeyed SHA-256 by brute force from a key dump or backup.
 */
export function actorKey(actor: Actor, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`${actor.kind}:${actor.id}`)
    .digest('base64url');
  return `${actor.kind}:${digest.slice(0, 22)}`;
}
