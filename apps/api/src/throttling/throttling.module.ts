import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { type Redis } from 'ioredis';

import { ActorThrottlerGuard } from './actor-throttler.guard';
import { SlidingWindowThrottlerStorage } from './sliding-window.storage';
import { VALKEY } from '../valkey/valkey.module';

/**
 * Default policy for every route: 300 requests per actor per minute (API §8 "console writes").
 * Endpoints with tighter limits (join, rounds, chat, …) override it with @Throttle as they land.
 */
export const DEFAULT_THROTTLE = { name: 'default', ttl: 60_000, limit: 300 } as const;

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [VALKEY],
      useFactory: (valkey: Redis) => ({
        throttlers: [DEFAULT_THROTTLE],
        storage: new SlidingWindowThrottlerStorage(valkey),
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ActorThrottlerGuard }],
})
export class ThrottlingModule {}
