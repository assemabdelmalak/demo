import { type Mailer } from './mailer.js';
import { createSmtpMailer } from './smtp.js';

/** The mail variables both the API and the worker env schemas carry. */
export interface MailConfig {
  MAIL_PROVIDER: 'smtp' | 'resend';
  SMTP_URL?: string | undefined;
  EMAIL_FROM: string;
}

/**
 * The adapter named by `MAIL_PROVIDER`, shared by the API and the worker. Throws at boot, not at
 * the first email, when misconfigured.
 */
export function createConfiguredMailer(config: MailConfig): Mailer {
  switch (config.MAIL_PROVIDER) {
    case 'smtp':
      if (!config.SMTP_URL) {
        throw new Error('MAIL_PROVIDER=smtp needs SMTP_URL (for example smtp://localhost:1025).');
      }
      return createSmtpMailer({ url: config.SMTP_URL, from: config.EMAIL_FROM });
    case 'resend':
      throw new Error(
        'MAIL_PROVIDER=resend is not available yet: the Resend adapter arrives in P9-T04. Use smtp.',
      );
  }
}

/** Only the domain: enough to spot a failing provider, never enough to identify a person. */
export function emailDomain(address: string): string {
  const at = address.lastIndexOf('@');
  return at === -1 ? 'unknown' : address.slice(at + 1).toLowerCase();
}

/** Removes each of `secrets` (an address, a link) from text such as an SMTP error message. */
export function redact(text: string, ...secrets: string[]): string {
  return secrets.reduce(
    (result, secret) => (secret ? result.split(secret).join('[redacted]') : result),
    text,
  );
}
