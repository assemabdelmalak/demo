import { type DynamicModule, Global, Module } from '@nestjs/common';

import { createSmtpMailer, type Mailer } from '@radd/mail';

import { API_ENV, type ApiEnv } from '../config/env.module';

/** Injection token for the API's `Mailer`. */
export const MAILER = Symbol('MAILER');

/** The adapter named by `MAIL_PROVIDER`. Throws at boot, not at the first email, when misconfigured. */
export function createMailer(env: ApiEnv): Mailer {
  switch (env.MAIL_PROVIDER) {
    case 'smtp':
      if (!env.SMTP_URL) {
        throw new Error('MAIL_PROVIDER=smtp needs SMTP_URL (for example smtp://localhost:1025).');
      }
      return createSmtpMailer({ url: env.SMTP_URL, from: env.EMAIL_FROM });
    case 'resend':
      throw new Error(
        'MAIL_PROVIDER=resend is not available yet: the Resend adapter arrives in P9-T04. Use smtp.',
      );
  }
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
