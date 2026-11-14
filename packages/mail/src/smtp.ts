import { createTransport } from 'nodemailer';

import { type Mailer, type MailMessage } from './mailer.js';

export interface SmtpMailerOptions {
  /** e.g. `smtp://localhost:1025` (Mailpit) or `smtps://user:pass@host:465`. */
  url: string;
  /** The `From` header, e.g. `Radd Menu <no-reply@example.com>`. */
  from: string;
}

export function createSmtpMailer({ url, from }: SmtpMailerOptions): Mailer {
  const transport = createTransport({
    url,
    // A mail server that hangs must not hold a request or a job for minutes.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
  return {
    async send(message: MailMessage): Promise<void> {
      await transport.sendMail({ from, ...message });
    },
  };
}
