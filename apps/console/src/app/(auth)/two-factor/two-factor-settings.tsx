'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  type PasswordConfirmInput,
  passwordConfirmSchema,
  type TotpCodeInput,
  totpCodeSchema,
} from '@radd/shared/dto';
import { Alert, Button, Field } from '@radd/ui';

import { CodeField } from '@/components/auth/code-field';
import { FailureAlert, useFieldMessage } from '@/components/auth/form-messages';
import { PasswordInput } from '@/components/auth/password-input';
import { QrCode } from '@/components/auth/qr-code';
import { SubmitButton } from '@/components/auth/submit-button';
import { authClient } from '@/lib/auth-client';
import { type Failure, runAuth } from '@/lib/auth-errors';
import { totpSecret } from '@/lib/totp';

interface Setup {
  uri: string;
  backupCodes: string[];
}

type Step =
  | { name: 'idle'; notice?: 'on' | 'off' }
  | { name: 'password'; action: 'enable' | 'disable' }
  | { name: 'scan'; setup: Setup }
  | { name: 'backup'; codes: string[] };

function PasswordStep({
  action,
  onCancel,
  onEnabled,
  onDisabled,
}: {
  action: 'enable' | 'disable';
  onCancel: () => void;
  onEnabled: (setup: Setup) => void;
  onDisabled: () => void;
}) {
  const t = useTranslations('auth');
  const message = useFieldMessage();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordConfirmInput>({
    resolver: zodResolver(passwordConfirmSchema),
    defaultValues: { password: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFailure(null);
    if (action === 'disable') {
      const result = await runAuth(() => authClient().twoFactor.disable({ password }));
      if (result.ok) onDisabled();
      else setFailure(result.failure);
      return;
    }
    const result = await runAuth(() => authClient().twoFactor.enable({ password }));
    if (!result.ok) setFailure(result.failure);
    // Only TOTP is configured on the API; an OTP-only answer would mean a server change.
    else if ('totpURI' in result.data) {
      onEnabled({ uri: result.data.totpURI, backupCodes: result.data.backupCodes });
    } else setFailure({ kind: 'unknown', status: null });
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      className="flex flex-col gap-4"
    >
      <p>{t('twoFactor.confirmPassword')}</p>
      <FailureAlert failure={failure} />
      <Field label={t('common.password')} error={message('password', errors.password)} required>
        {(wiring) => (
          <PasswordInput autoComplete="current-password" {...wiring} {...register('password')} />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={isSubmitting}>{t('twoFactor.continue')}</SubmitButton>
        <Button variant="ghost" onClick={onCancel}>
          {t('twoFactor.cancel')}
        </Button>
      </div>
    </form>
  );
}

function ScanStep({ setup, onConfirmed }: { setup: Setup; onConfirmed: () => void }) {
  const t = useTranslations('auth.twoFactor');
  const [failure, setFailure] = useState<Failure | null>(null);
  const { control, handleSubmit, formState } = useForm<TotpCodeInput>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: '' },
  });
  const secret = totpSecret(setup.uri);

  // Better Auth turns two-factor on only once a code from the app proves the secret was saved.
  const onSubmit = handleSubmit(async ({ code }) => {
    setFailure(null);
    const result = await runAuth(() => authClient().twoFactor.verifyTotp({ code }));
    if (result.ok) onConfirmed();
    else setFailure(result.failure);
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-dish font-semibold">{t('scanTitle')}</h2>
      <p className="text-muted">{t('scanHelp')}</p>
      <QrCode value={setup.uri} label={t('qrLabel')} />
      {secret ? (
        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold">{t('secret')}</p>
          <code dir="ltr" className="self-start font-mono text-body break-all select-all">
            {secret}
          </code>
        </div>
      ) : null}
      <form
        noValidate
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-4"
      >
        <FailureAlert failure={failure} />
        <CodeField control={control} name="code" label={t('confirmCode')} />
        <SubmitButton pending={formState.isSubmitting}>{t('confirm')}</SubmitButton>
      </form>
    </div>
  );
}

function BackupStep({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations('auth.twoFactor');
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-dish font-semibold">{t('backupTitle')}</h2>
      <p className="text-muted">{t('backupHelp')}</p>
      <ul
        aria-label={t('backupList')}
        dir="ltr"
        className="grid grid-cols-2 gap-2 rounded-input border border-border p-3 font-mono"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      {copied ? <Alert tone="success">{t('copied')}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(codes.join('\n')).then(() => {
              setCopied(true);
            });
          }}
        >
          {t('copy')}
        </Button>
        <Button onClick={onDone}>{t('done')}</Button>
      </div>
    </div>
  );
}

/** Turn TOTP two-factor on (password, scan, confirm, backup codes shown once) or off. */
export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations('auth.twoFactor');
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'idle' });

  const idle = (notice?: 'on' | 'off') => {
    setStep(notice ? { name: 'idle', notice } : { name: 'idle' });
    // The server page reads the new state from /v1/me.
    router.refresh();
  };

  switch (step.name) {
    case 'password':
      return (
        <PasswordStep
          action={step.action}
          onCancel={() => {
            setStep({ name: 'idle' });
          }}
          onEnabled={(setup) => {
            setStep({ name: 'scan', setup });
          }}
          onDisabled={() => {
            idle('off');
          }}
        />
      );
    case 'scan':
      return (
        <ScanStep
          setup={step.setup}
          onConfirmed={() => {
            setStep({ name: 'backup', codes: step.setup.backupCodes });
          }}
        />
      );
    case 'backup':
      return (
        <BackupStep
          codes={step.codes}
          onDone={() => {
            idle('on');
          }}
        />
      );
    case 'idle':
      return (
        <div className="flex flex-col gap-4">
          {step.notice ? (
            <Alert tone="success">{step.notice === 'on' ? t('turnedOn') : t('turnedOff')}</Alert>
          ) : null}
          <p>{enabled ? t('statusOn') : t('statusOff')}</p>
          <Button
            variant={enabled ? 'secondary' : 'primary'}
            className="self-start"
            onClick={() => {
              setStep({ name: 'password', action: enabled ? 'disable' : 'enable' });
            }}
          >
            {enabled ? t('disable') : t('enable')}
          </Button>
          <Link href="/" className="self-start text-small font-semibold text-ink underline">
            {t('back')}
          </Link>
        </div>
      );
  }
}
