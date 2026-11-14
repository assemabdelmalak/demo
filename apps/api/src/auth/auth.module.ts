import {
  type BeforeApplicationShutdown,
  type DynamicModule,
  Inject,
  Logger,
  Module,
} from '@nestjs/common';
import { type Redis } from 'ioredis';

import { type DbHandle } from '@radd/db';
import { type Mailer } from '@radd/mail';

import { AuthMailer } from './auth-mailer';
import { type AuthRateLimitStorage, createValkeyRateLimitStorage } from './auth-rate-limit';
import { createAuth } from './auth.config';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { API_ENV, type ApiEnv } from '../config/env.module';
import { DB } from '../db/db.module';
import { MAILER } from '../mail/mail.module';
import { VALKEY } from '../valkey/valkey.module';

/** The Better Auth instance (`Auth` from `auth.config.ts`). */
export const AUTH = Symbol('AUTH');
/** The Valkey limiter shared by Better Auth and the bridge's code-email cap. */
export const AUTH_RATE_LIMITER = Symbol('AUTH_RATE_LIMITER');
export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');

export interface AuthModuleOptions {
  /** Better Auth's limiter. Tests turn it off, or its 3-per-10-seconds sign-in rule trips them. */
  rateLimit?: boolean;
  /** The 10-per-15-minutes cap on code emails per client IP. */
  codeRequestLimit?: boolean;
}

@Module({})
export class AuthModule implements BeforeApplicationShutdown {
  constructor(@Inject(AuthMailer) private readonly mailer: AuthMailer) {}

  static register(options: AuthModuleOptions = {}): DynamicModule {
    const resolved: Required<AuthModuleOptions> = {
      rateLimit: options.rateLimit ?? true,
      codeRequestLimit: options.codeRequestLimit ?? true,
    };
    return {
      module: AuthModule,
      controllers: [MeController],
      providers: [
        MeService,
        { provide: AUTH_OPTIONS, useValue: resolved },
        {
          provide: AuthMailer,
          inject: [MAILER],
          useFactory: (mailer: Mailer) => new AuthMailer(mailer, new Logger('AuthMailer')),
        },
        {
          provide: AUTH_RATE_LIMITER,
          inject: [API_ENV, VALKEY],
          useFactory: (env: ApiEnv, valkey: Redis): AuthRateLimitStorage =>
            createValkeyRateLimitStorage(
              valkey,
              env.ACTOR_HASH_SECRET,
              new Logger('AuthRateLimit'),
            ),
        },
        {
          provide: AUTH,
          inject: [API_ENV, DB, AuthMailer, VALKEY],
          useFactory: (env: ApiEnv, handle: DbHandle, mailer: AuthMailer, valkey: Redis) =>
            createAuth({
              env,
              db: handle.db,
              mailer,
              valkey,
              logger: new Logger('BetterAuth'),
              rateLimit: resolved.rateLimit,
            }),
        },
      ],
      exports: [AUTH, AUTH_RATE_LIMITER, AUTH_OPTIONS, AuthMailer],
    };
  }

  /**
   * Codes Better Auth already issued are still delivered before the process exits. "Before"
   * shutdown, so the database pool (closed on shutdown) is still there for the pre-send check.
   */
  async beforeApplicationShutdown(): Promise<void> {
    await this.mailer.settled();
  }
}
