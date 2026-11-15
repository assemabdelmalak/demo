import { setTimeout as sleep } from 'node:timers/promises';

import { type LoggerService } from '@nestjs/common';

import { emailDomain, type EmailTemplate, type Mailer, redact, renderEmail } from '@radd/mail';
import { type UiLocale } from '@radd/shared';

/** The code types Better Auth's email-OTP plugin sends. */
export type AuthCodeType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

/** Must match the email-OTP plugin's `expiresIn` (seconds); the email states it in minutes. */
export const AUTH_CODE_TTL_SECONDS = 300;

export interface AuthCodeEmail {
  to: string;
  code: string;
  type: AuthCodeType;
  locale: UiLocale;
  /**
   * Decides, off the request path, whether the code may be sent at all (e.g. not a sign-in code to
   * an account with two-factor on). Running it here keeps the response time the same either way.
   */
  shouldSend?: () => Promise<boolean>;
}

function templateFor(type: AuthCodeType, code: string): EmailTemplate | undefined {
  const minutes = AUTH_CODE_TTL_SECONDS / 60;
  switch (type) {
    case 'sign-in':
      return { name: 'sign-in-code', code, minutes };
    case 'email-verification':
      return { name: 'verify-email-code', code, minutes };
    case 'forget-password':
      return { name: 'reset-password-code', code, minutes };
    case 'change-email':
      // Email change is not offered (its endpoints are disabled); nothing to send.
      return undefined;
  }
}

/**
 * Sends auth codes directly from the API (ADR-029): a live code must never wait in Valkey or show
 * in Bull Board. Delivery runs in the background so the response does not reveal, by its timing,
 * whether the address has an account; a failed send is retried twice in-process.
 */
export class AuthMailer {
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly mailer: Mailer,
    private readonly logger: LoggerService,
    private readonly retryDelaysMs: readonly number[] = [500, 2_000],
  ) {}

  /** Starts delivery and returns at once. */
  sendCode(email: AuthCodeEmail): void {
    const task = this.deliver(email).finally(() => this.inFlight.delete(task));
    this.inFlight.add(task);
  }

  /** Resolves when every delivery started so far has finished; for shutdown and tests. */
  async settled(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  private async deliver({ to, code, type, locale, shouldSend }: AuthCodeEmail): Promise<void> {
    const template = templateFor(type, code);
    if (!template) return;
    try {
      if (shouldSend && !(await shouldSend())) return;
    } catch (error) {
      // When in doubt, do not send: the user can ask again, a wrongly sent code cannot be unsent.
      this.logFailure(template.name, to, error, 'pre-send check failed');
      return;
    }
    const message = { to, ...renderEmail(template, locale) };
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.mailer.send(message);
        return;
      } catch (error) {
        const delay = this.retryDelaysMs[attempt];
        if (delay === undefined) {
          this.logFailure(
            template.name,
            to,
            error,
            `not sent after ${String(attempt + 1)} attempts`,
          );
          return;
        }
        await sleep(delay);
      }
    }
  }

  private logFailure(template: string, to: string, error: unknown, what: string): void {
    // The error's name and message only: SMTP errors can echo the envelope (the full address).
    const err =
      error instanceof Error ? { name: error.name, message: redact(error.message, to) } : undefined;
    this.logger.error({ err, template, domain: emailDomain(to) }, `auth email ${what}`);
  }
}
