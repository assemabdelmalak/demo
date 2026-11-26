import { type DynamicModule, Global, Module } from '@nestjs/common';

import { createConfiguredMailer, type Mailer } from '@radd/mail';

import { API_ENV, type ApiEnv } from '../config/env.module';

/** Injection token for the API's `Mailer`. */
export const MAILER = Symbol('MAILER');

/** The adapter named by `MAIL_PROVIDER`; the same selection the worker uses. */
export function createMailer(env: ApiEnv): Mailer {
  return createConfiguredMailer(env);
}

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
          : { provide: MAILER, inject: [API_ENV], useFactory: createMailer },
      ],
      exports: [MAILER],
    };
  }
}
