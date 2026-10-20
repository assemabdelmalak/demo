import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type FastifyRequest } from 'fastify';

import { actorKey, resolveActor } from '../common/actor';

/** Limits per user, participant or device; IP only when a request carries no identity yet. */
@Injectable()
export class ActorThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(actorKey(resolveActor(req as unknown as FastifyRequest)));
  }
}
