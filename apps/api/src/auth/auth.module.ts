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

import { SignInLockout } from './address-limits';
import { AuthMailer } from './auth-mailer';
import { type AuthRateLimitStorage, createValkeyRateLimitStorage } from './auth-rate-limit';
import { createAuth } from './auth.config';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { PinSessionGate } from './pin-session';
import { API_ENV, type ApiEnv } from '../config/env.module';
import { DB } from '../db/db.module';
import { MAILER } from '../mail/mail.module';
import { QueueProducer } from '../queues/queue-producer';
import { deviceCookieSpec } from '../staff/device-cookie';
import { VALKEY } from '../valkey/valkey.module';

/** The Better Auth instance (`Auth` from `auth.config.ts`). */
export const AUTH = Symbol('AUTH');
/** The Valkey limiter shared by Better Auth and the bridge's code-email cap. */
export const AUTH_RATE_LIMITER = Symbol('AUTH_RATE_LIMITER');
export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');

export interface AuthModuleOptions {
  /** Better Auth's limiter. Tests turn it off, or its 3-per-10-seconds sign-in rule trips them. */
  rateLimit?: boolean;
  /** The caps on code emails: 10 per 15 minutes per client IP, 5 an hour per address (ADR-034). */
  codeRequestLimit?: boolean;
  /** The 15-minute pause on an address after 10 wrong passwords (ADR-034). */
  signInLockout?: boolean;
}

@Module({})
export class AuthModule implements BeforeApplicationShutdown {
  constructor(@Inject(AuthMailer) private readonly mailer: AuthMailer) {}

  static register(options: AuthModuleOptions = {}): DynamicModule {
    const resolved: Required<AuthModuleOptions> = {
      rateLimit: options.rateLimit ?? true,
      codeRequestLimit: options.codeRequestLimit ?? true,
      signInLockout: options.signInLockout ?? true,
    };
    return {
      module: AuthModule,
      // The Better Auth instance is needed by every module that wraps its endpoints.
      global: true,
      controllers: [MeController],
      providers: [
        MeService,
        { provide: AUTH_OPTIONS, useValue: resolved },
        {
          provide: PinSessionGate,
          inject: [DB, API_ENV],
          useFactory: (handle: DbHandle, env: ApiEnv) =>
            new PinSessionGate(handle, deviceCookieSpec(env.BETTER_AUTH_URL)),
        },
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
          provide: SignInLockout,
          inject: [API_ENV, VALKEY],
          useFactory: (env: ApiEnv, valkey: Redis) =>
            new SignInLockout(valkey, env.ACTOR_HASH_SECRET, new Logger('SignInLockout')),
        },
        {
          provide: AUTH,
          inject: [API_ENV, DB, AuthMailer, VALKEY, QueueProducer],
          useFactory: (
            env: ApiEnv,
            handle: DbHandle,
            mailer: AuthMailer,
            valkey: Redis,
            queue: QueueProducer,
          ) =>
            createAuth({
              env,
              db: handle.db,
              mailer,
              valkey,
              logger: new Logger('BetterAuth'),
              enqueueEmail: (payload, jobId) => queue.enqueue('notify.email', payload, { jobId }),
              rateLimit: resolved.rateLimit,
            }),
        },
      ],
      exports: [AUTH, AUTH_RATE_LIMITER, AUTH_OPTIONS, AuthMailer, PinSessionGate, SignInLockout],
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
