import { type DynamicModule, Global, Module } from '@nestjs/common';

import { createConfiguredMailer, type Mailer } from '@radd/mail';

import { WORKER_ENV, type WorkerEnv } from '../config/env.module';

/** Injection token for the worker's `Mailer`. */
export const MAILER = Symbol('MAILER');

/** The same adapter selection as the API (`MAIL_PROVIDER`); fails at boot when misconfigured. */
@Global()
@Module({})
export class MailModule {
  /** `mailer` replaces the configured adapter, e.g. a `MemoryMailer` in tests. */
  static register(mailer?: Mailer): DynamicModule {
    return {
      module: MailModule,
      providers: [
        mailer
          ? { provide: MAILER, useValue: mailer }
          : {
              provide: MAILER,
              inject: [WORKER_ENV],
              useFactory: (env: WorkerEnv) => createConfiguredMailer(env),
            },
      ],
      exports: [MAILER],
    };
  }
}
