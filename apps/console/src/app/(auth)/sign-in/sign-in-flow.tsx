'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  type BackupCodeInput,
  backupCodeInputSchema,
  type EmailCodeInput,
  emailCodeSchema,
  type EmailOnlyInput,
  emailOnlySchema,
  type SignInPasswordInput,
  signInPasswordSchema,
  type TotpCodeInput,
  totpCodeSchema,
} from '@radd/shared/dto';
import { Alert, Button, Field, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@radd/ui';

import { AuthHeading } from '@/components/auth/auth-heading';
import { CodeField } from '@/components/auth/code-field';
import { FailureAlert, useFieldMessage } from '@/components/auth/form-messages';
import { PasswordInput } from '@/components/auth/password-input';
import { ResendCode } from '@/components/auth/resend-code';
import { SubmitButton } from '@/components/auth/submit-button';
import { authClient } from '@/lib/auth-client';
import { type Failure, runAuth } from '@/lib/auth-errors';
import { verifyEmailHref, withNext } from '@/lib/navigation';

type Done = () => void;

/** Better Auth answers a password sign-in on a two-factor account with this instead of a session. */
function needsSecondFactor(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true
  );
}

function PasswordForm({
  next,
  onDone,
  onSecondFactor,
}: {
  next: string | null;
  onDone: Done;
  onSecondFactor: Done;
}) {
  const t = useTranslations('auth');
  const message = useFieldMessage();
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInPasswordInput>({
    resolver: zodResolver(signInPasswordSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    const result = await runAuth(() => authClient().signIn.email(values));
    if (result.ok) {
      if (needsSecondFactor(result.data)) onSecondFactor();
      else onDone();
      return;
    }
    const { failure: problem } = result;
    // Only reachable with the right password, so it reveals nothing about the address. The
    // code was not sent at sign-up time if it expired; ask for a fresh one and go enter it.
    if (problem.kind === 'code' && problem.code === 'EMAIL_NOT_VERIFIED') {
      await runAuth(() =>
        authClient().emailOtp.sendVerificationOtp({
          email: values.email,
          type: 'email-verification',
        }),
      );
      router.push(verifyEmailHref(values.email, next));
      return;
    }
    setFailure(problem);
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      className="flex flex-col gap-4"
    >
      <FailureAlert failure={failure} />
      <Field label={t('common.email')} error={message('email', errors.email)} required>
        {(wiring) => (
          <Input
            type="email"
            autoComplete="username"
            dir="ltr"
            {...wiring}
            {...register('email')}
          />
        )}
      </Field>
      <Field
        label={t('common.password')}
        error={message('password', errors.password)}
        required
        labelAside={
          <Link href="/forgot-password" className="text-small text-ink underline">
            {t('signIn.forgot')}
          </Link>
        }
      >
        {(wiring) => (
          <PasswordInput autoComplete="current-password" {...wiring} {...register('password')} />
        )}
      </Field>
      <SubmitButton pending={isSubmitting}>{t('signIn.submit')}</SubmitButton>
    </form>
  );
}

function CodeSignIn({ onDone }: { onDone: Done }) {
  const t = useTranslations('auth');
  const message = useFieldMessage();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const emailForm = useForm<EmailOnlyInput>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });
  const codeForm = useForm<EmailCodeInput>({
    resolver: zodResolver(emailCodeSchema),
    defaultValues: { email: '', otp: '' },
  });

  const send = (email: string) =>
    runAuth(() => authClient().emailOtp.sendVerificationOtp({ email, type: 'sign-in' }));

  const requestCode = emailForm.handleSubmit(async ({ email }) => {
    setFailure(null);
    const result = await send(email);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    codeForm.reset({ email, otp: '' });
    setSentTo(email);
  });

  const signIn = codeForm.handleSubmit(async (values) => {
    setFailure(null);
    const result = await runAuth(() => authClient().signIn.emailOtp(values));
    if (result.ok) onDone();
    else setFailure(result.failure);
  });

  if (!sentTo) {
    return (
      <form
        noValidate
        onSubmit={(event) => {
          void requestCode(event);
        }}
        className="flex flex-col gap-4"
      >
        <FailureAlert failure={failure} />
        <Field
          label={t('common.email')}
          error={message('email', emailForm.formState.errors.email)}
          required
        >
          {(wiring) => (
            <Input
              type="email"
              autoComplete="email"
              dir="ltr"
              {...wiring}
              {...emailForm.register('email')}
            />
          )}
        </Field>
        <SubmitButton pending={emailForm.formState.isSubmitting}>
          {t('signIn.sendCode')}
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The same words whether or not the address has an account (the API sends nothing then). */}
      <Alert tone="info">
        {t.rich('signIn.codeSent', {
          address: sentTo,
          email: (chunks) => <bdi>{chunks}</bdi>,
        })}
      </Alert>
      <form
        noValidate
        onSubmit={(event) => {
          void signIn(event);
        }}
        className="flex flex-col gap-4"
      >
        <FailureAlert failure={failure} />
        <CodeField
          control={codeForm.control}
          name="otp"
          label={t('common.code')}
          hint={t('common.codeHint')}
        />
        <SubmitButton pending={codeForm.formState.isSubmitting}>{t('signIn.submit')}</SubmitButton>
      </form>
      <p className="text-small text-muted">{t('signIn.codeTwoFactorNote')}</p>
      <ResendCode send={() => send(sentTo)} sentOnArrival />
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => {
          setFailure(null);
          setSentTo(null);
        }}
      >
        {t('signIn.otherEmail')}
      </Button>
    </div>
  );
}

function SecondFactor({ onDone, onRestart }: { onDone: Done; onRestart: Done }) {
  const t = useTranslations('auth');
  const message = useFieldMessage();
  const [useBackup, setUseBackup] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const totpForm = useForm<TotpCodeInput>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: '' },
  });
  const backupForm = useForm<BackupCodeInput>({
    resolver: zodResolver(backupCodeInputSchema),
    defaultValues: { code: '' },
  });

  const finish = (result: { ok: boolean; failure?: Failure }) => {
    if (result.ok) {
      onDone();
      return;
    }
    const problem = result.failure ?? null;
    // The pending sign-in (a short-lived cookie) is gone; only a new password sign-in helps.
    if (problem?.kind === 'code' && problem.code === 'INVALID_TWO_FACTOR_COOKIE') onRestart();
    setFailure(problem);
  };

  const verifyTotp = totpForm.handleSubmit(async ({ code }) => {
    setFailure(null);
    finish(await runAuth(() => authClient().twoFactor.verifyTotp({ code })));
  });
  const verifyBackup = backupForm.handleSubmit(async ({ code }) => {
    setFailure(null);
    finish(await runAuth(() => authClient().twoFactor.verifyBackupCode({ code })));
  });

  return (
    <>
      <AuthHeading
        title={t('twoFactorChallenge.title')}
        subtitle={useBackup ? t('twoFactorChallenge.backupHint') : t('twoFactorChallenge.subtitle')}
      />
      <FailureAlert failure={failure} />
      {useBackup ? (
        <form
          noValidate
          onSubmit={(event) => {
            void verifyBackup(event);
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label={t('twoFactorChallenge.backupCode')}
            error={message('backupCode', backupForm.formState.errors.code)}
            required
          >
            {(wiring) => (
              <Input
                autoComplete="one-time-code"
                dir="ltr"
                spellCheck={false}
                {...wiring}
                {...backupForm.register('code')}
              />
            )}
          </Field>
          <SubmitButton pending={backupForm.formState.isSubmitting}>
            {t('twoFactorChallenge.submit')}
          </SubmitButton>
        </form>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            void verifyTotp(event);
          }}
          className="flex flex-col gap-4"
        >
          <CodeField control={totpForm.control} name="code" label={t('twoFactorChallenge.code')} />
          <SubmitButton pending={totpForm.formState.isSubmitting}>
            {t('twoFactorChallenge.submit')}
          </SubmitButton>
        </form>
      )}
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => {
          setFailure(null);
          setUseBackup((backup) => !backup);
        }}
      >
        {useBackup ? t('twoFactorChallenge.useApp') : t('twoFactorChallenge.useBackup')}
      </Button>
    </>
  );
}

/**
 * Sign-in with a password or an emailed code, then the authenticator step when the account has
 * two-factor on. Afterwards `/` (or `next`) decides between onboarding and the role's home.
 */
export function SignInFlow({
  next,
  passwordChanged,
  title,
  subtitle,
}: {
  next: string | null;
  passwordChanged: boolean;
  title: string;
  subtitle: string;
}) {
  const t = useTranslations('auth.signIn');
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'second-factor'>('credentials');
  const [restartFailure, setRestartFailure] = useState(false);

  const done = () => {
    router.replace(next ?? '/');
  };

  if (step === 'second-factor') {
    return (
      <SecondFactor
        onDone={done}
        onRestart={() => {
          setRestartFailure(true);
          setStep('credentials');
        }}
      />
    );
  }

  return (
    <>
      <AuthHeading title={title} subtitle={subtitle} />
      {passwordChanged ? <Alert tone="success">{t('passwordChanged')}</Alert> : null}
      {restartFailure ? (
        <FailureAlert failure={{ kind: 'code', code: 'INVALID_TWO_FACTOR_COOKIE', status: 401 }} />
      ) : null}
      <Tabs defaultValue="password" className="flex flex-col gap-2">
        <TabsList aria-label={t('methods')} className="w-full">
          <TabsTrigger value="password" className="flex-1">
            {t('withPassword')}
          </TabsTrigger>
          <TabsTrigger value="code" className="flex-1">
            {t('withCode')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="password">
          <PasswordForm
            next={next}
            onDone={done}
            onSecondFactor={() => {
              setRestartFailure(false);
              setStep('second-factor');
            }}
          />
        </TabsContent>
        <TabsContent value="code">
          <CodeSignIn onDone={done} />
        </TabsContent>
      </Tabs>
      <p className="text-small text-muted">
        {t('noAccount')}{' '}
        <Link href={withNext('/sign-up', next)} className="font-semibold text-ink underline">
          {t('signUp')}
        </Link>
      </p>
    </>
  );
}
