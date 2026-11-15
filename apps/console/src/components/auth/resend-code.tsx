'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Alert, Button } from '@radd/ui';

import { FailureAlert } from './form-messages';
import { RESEND_COOLDOWN_SECONDS, useCooldown } from './use-cooldown';

import { type Failure, type Result } from '@/lib/auth-errors';

/**
 * "Send a new code", with a cooldown. It says the same thing whether or not the address has an
 * account, as the API does.
 */
export function ResendCode({
  send,
  sentOnArrival,
}: {
  /** Requests the email; resolves to whether it went through. */
  send: () => Promise<Result<unknown> | null>;
  /** A code was sent just before this page opened, so the first resend waits. */
  sentOnArrival: boolean;
}) {
  const t = useTranslations('auth.common');
  const { remaining, start } = useCooldown(sentOnArrival ? RESEND_COOLDOWN_SECONDS : 0);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);

  async function resend() {
    if (pending || remaining > 0) return;
    setPending(true);
    setFailure(null);
    setSent(false);
    const result = await send();
    setPending(false);
    // Null: the form refused the address before anything was sent; its field says why.
    if (!result) return;
    if (result.ok) {
      setSent(true);
      start();
    } else {
      setFailure(result.failure);
      if (result.failure.kind === 'rate-limited')
        start(result.failure.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
    }
  }

  const waiting = remaining > 0;
  return (
    <div className="flex flex-col gap-3">
      {sent ? <Alert tone="success">{t('newCodeSent')}</Alert> : null}
      <FailureAlert failure={failure} />
      <Button
        variant="secondary"
        aria-disabled={waiting || pending}
        onClick={() => {
          void resend();
        }}
        className="self-start"
      >
        {waiting ? t('sendNewCodeIn', { seconds: remaining }) : t('sendNewCode')}
      </Button>
    </div>
  );
}
