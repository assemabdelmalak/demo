export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * The one way the product sends email (ARCHITECTURE §1: every external dependency sits behind an
 * interface we own). SMTP reaches Mailpit locally; the Resend adapter arrives in P9-T04.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Keeps messages in memory; for tests. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The newest message to an address, or undefined. */
  latestTo(address: string): MailMessage | undefined {
    return this.sent.findLast((message) => message.to === address);
  }
}
