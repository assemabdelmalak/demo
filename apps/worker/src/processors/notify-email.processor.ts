import { Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';

import { emailDomain, type EmailTemplate, type Mailer, redact, renderEmail } from '@radd/mail';
import { type NotifyEmailPayload, QUEUES } from '@radd/shared';

import { ReportingWorkerHost } from './reporting-worker-host';
import { MAILER } from '../mail/mail.module';

type TemplateBuilders = {
  [K in NotifyEmailPayload['template']]: (
    payload: Extract<NotifyEmailPayload, { template: K }>,
  ) => EmailTemplate;
};

/** One builder per queued template; adding a payload variant fails typecheck until it has one. */
const TEMPLATES: TemplateBuilders = {
  invitation: ({ params }) => ({ name: 'invitation', ...params }),
};

/**
 * Sends queued emails (ADR-029: invitations; auth codes never come through here). A failed send
 * is retried with the queue's backoff. The recipient and the link are never logged, and are cut
 * out of error messages before they reach the failure log or Sentry.
 */
@Processor('notify.email', { concurrency: QUEUES['notify.email'].concurrency })
export class NotifyEmailProcessor extends ReportingWorkerHost {
  private readonly logger = new Logger(NotifyEmailProcessor.name);

  constructor(@Inject(MAILER) private readonly mailer: Mailer) {
    super();
  }

  async process(job: Job): Promise<{ template: string }> {
    const parsed = QUEUES['notify.email'].payload.safeParse(job.data);
    // Retrying cannot fix a malformed payload; the issues are not logged (they echo the data).
    if (!parsed.success) throw new UnrecoverableError('invalid notify.email payload');
    const payload = parsed.data;
    const message = {
      to: payload.to,
      ...renderEmail(TEMPLATES[payload.template](payload), payload.locale),
    };
    try {
      await this.mailer.send(message);
    } catch (error) {
      const detail =
        error instanceof Error
          ? redact(error.message, payload.to, payload.params.url)
          : 'unknown error';
      // No `cause`: the original error can carry the envelope (the full address) to logs and Sentry.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(`email not sent: ${detail}`);
    }
    this.logger.debug(
      { jobId: job.id, template: payload.template, domain: emailDomain(payload.to) },
      'email sent',
    );
    return { template: payload.template };
  }
}
