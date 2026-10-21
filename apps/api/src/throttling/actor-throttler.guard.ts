import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { type FastifyRequest } from 'fastify';

import { actorKey, resolveActor } from '../common/actor';
import { API_ENV, type ApiEnv } from '../config/env.module';

/** Limits per user, participant or device; IP only when a request carries no identity yet. */
@Injectable()
export class ActorThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {
    super(options, storageService, reflector);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(
      actorKey(resolveActor(req as unknown as FastifyRequest), this.env.ACTOR_HASH_SECRET),
    );
  }
}
