import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import { type Queue } from 'bullmq';
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { DomainError } from '@radd/shared';

import { type AuditService } from '../audit/audit.service';
import { superAdminVerdict } from '../authz/super-admin';
import { toProblem } from '../common/problem';
import { sendProblem } from '../common/problem.filter';

/** Bull Board's mount point (ADR-027, ARCHITECTURE §5). */
export const BULL_BOARD_PATH = '/v1/admin/queues';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface BullBoardDeps {
  queues: readonly Queue[];
  /** `SUPER_ADMIN_EMAILS`. */
  allowlist: readonly string[];
  /** The API's own origin: Bull Board's UI calls its API from here and nowhere else. */
  apiOrigin: string;
  typeBase: string;
  audit: Pick<AuditService, 'recordPlatform'>;
  /** Where a failed audit write is reported; the queue change itself has already happened. */
  onAuditError: (error: unknown) => void;
}

/**
 * Why a Bull Board request is refused, or null to let it through (pure). The same rule as
 * `@RequireSuperAdmin` routes, plus an Origin check on changes: the board's own UI is the only
 * page that may retry, clean or pause a queue, so a cross-site form can never do it.
 */
export function bullBoardRefusal(
  request: Pick<FastifyRequest, 'authSession' | 'method' | 'headers'>,
  allowlist: readonly string[],
  apiOrigin: string,
  now: Date = new Date(),
): DomainError | null {
  const session = request.authSession;
  if (!session) return new DomainError('UNAUTHENTICATED');
  const verdict = superAdminVerdict(session, allowlist, now);
  if (verdict === 'not_admin') return new DomainError('FORBIDDEN');
  if (verdict === 'two_factor_required') return new DomainError('TWO_FACTOR_REQUIRED');
  if (!SAFE_METHODS.has(request.method) && request.headers.origin !== apiOrigin) {
    return new DomainError('FORBIDDEN', { detail: 'Cross-origin change refused' });
  }
  return null;
}

/**
 * Mounts Bull Board at `/v1/admin/queues` as a raw Fastify plugin (it renders its own UI), behind
 * the super-admin check. Must be registered after the auth bridge, whose root `onRequest` hook
 * resolves `request.authSession` before this plugin's own hook runs. Every successful change
 * (retry, clean, pause, …) is audited as a platform action with no organisation, by the super
 * admin. These routes are raw Fastify, outside Nest's request context, so the origin is passed.
 */
export async function registerBullBoard(
  fastify: FastifyInstance,
  { queues, allowlist, apiOrigin, typeBase, audit, onAuditError }: BullBoardDeps,
): Promise<void> {
  const serverAdapter = new BullBoardFastifyAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
    options: { uiConfig: { boardTitle: 'Radd queues' } },
  });

  await fastify.register(
    async (scope) => {
      scope.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        const refusal = bullBoardRefusal(request, allowlist, apiOrigin);
        if (!refusal) return;
        sendProblem(reply, request, toProblem(refusal, typeBase), typeBase);
        return reply;
      });
      scope.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
        const session = request.authSession;
        if (SAFE_METHODS.has(request.method) || reply.statusCode >= 400 || !session) return;
        // Queue changes live in Valkey, not Postgres, so there is no transaction to share: the
        // entry follows the change. A failed write is reported, never thrown at a sent response.
        await audit
          .recordPlatform(
            {
              action: `admin.queues.${request.method.toLowerCase()}`,
              entityType: 'queue',
              // The board's API path names the queue and job, e.g. /api/queues/notify.email/retry/failed.
              entityId: new URL(request.url, 'http://bull-board.invalid').pathname,
            },
            {
              actor: { type: 'super_admin', id: session.userId },
              requestId: request.id,
              clientIp: request.clientIp ?? null,
              restaurantId: null,
            },
          )
          .catch(onAuditError);
      });
      await scope.register(serverAdapter.registerPlugin());
    },
    { prefix: BULL_BOARD_PATH },
  );
}
