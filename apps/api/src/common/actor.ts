import { createHash } from 'node:crypto';

import { type FastifyRequest } from 'fastify';

/** Set by the auth guards that arrive in P1 (users) and P4 (devices, participants). */
export interface RequestPrincipal {
  userId?: string;
  participantId?: string;
  deviceId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: RequestPrincipal;
  }
}

export interface Actor {
  kind: 'user' | 'participant' | 'device' | 'ip';
  id: string;
}

/**
 * Who is making the request, most specific first. Diners share restaurant Wi-Fi, so IP is only
 * the fallback for requests that carry no identity yet (CLAUDE §3.7).
 */
export function resolveActor(req: FastifyRequest): Actor {
  const principal = req.principal;
  if (principal?.userId) return { kind: 'user', id: principal.userId };
  if (principal?.participantId) return { kind: 'participant', id: principal.participantId };
  if (principal?.deviceId) return { kind: 'device', id: principal.deviceId };
  return { kind: 'ip', id: req.ip };
}

/** Stable, non-reversible key fragment, so raw IPs and IDs never land in Valkey key names. */
export function actorKey(actor: Actor): string {
  return `${actor.kind}:${createHash('sha256').update(actor.id).digest('base64url').slice(0, 22)}`;
}
