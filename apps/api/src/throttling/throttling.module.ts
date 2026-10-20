import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { type Redis } from 'ioredis';

import { ActorThrottlerGuard } from './actor-throttler.guard';
import { SlidingWindowThrottlerStorage } from './sliding-window.storage';
import { VALKEY } from '../valkey/valkey.module';

/**
 * Default policy: 300 requests per actor per minute across all routes together (API §8 "console
 * writes"), hence one bucket per actor rather than the library's per-handler key. Scoped limits
 * (join, item mutations, rounds, chat, …) arrive as named throttlers with their own keys.
 */
export const DEFAULT_THROTTLE = {
  name: 'default',
  ttl: 60_000,
  limit: 300,
  generateKey: (_context: unknown, tracker: string, name: string) => `${name}:${tracker}`,
} as const;

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
