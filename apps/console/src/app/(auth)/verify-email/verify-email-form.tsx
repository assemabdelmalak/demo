'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { type EmailCodeInput, emailCodeSchema } from '@radd/shared/dto';
import { Field, Input } from '@radd/ui';

import { CodeField } from '@/components/auth/code-field';
import { FailureAlert, useFieldMessage } from '@/components/auth/form-messages';
import { ResendCode } from '@/components/auth/resend-code';
import { SubmitButton } from '@/components/auth/submit-button';
import { authClient } from '@/lib/auth-client';
import { type Failure, runAuth } from '@/lib/auth-errors';
import { withNext } from '@/lib/navigation';

export function VerifyEmailForm({
  email,
  next,
  fresh,
}: {
  email: string;
  next: string | null;
  fresh: boolean;
}) {
  const t = useTranslations('auth');
  const message = useFieldMessage();
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    control,
    register,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<EmailCodeInput>({
    resolver: zodResolver(emailCodeSchema),
    defaultValues: { email, otp: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    // A correct code confirms the address and signs in (autoSignInAfterVerification).
    const result = await runAuth(() => authClient().emailOtp.verifyEmail(values));
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    router.replace(next ?? '/');
  });

  async function resend() {
    if (!(await trigger('email'))) return null;
    return runAuth(() =>
      authClient().emailOtp.sendVerificationOtp({
        email: emailCodeSchema.shape.email.parse(getValues('email')),
        type: 'email-verification',
      }),
    );
  }

  return (
    <>
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
            <Input type="email" autoComplete="email" dir="ltr" {...wiring} {...register('email')} />
          )}
        </Field>
        <CodeField
          control={control}
          name="otp"
          label={t('common.code')}
          hint={t('common.codeHint')}
        />
        <SubmitButton pending={isSubmitting}>{t('verifyEmail.submit')}</SubmitButton>
      </form>
      <ResendCode send={resend} sentOnArrival={fresh} />
      <p className="text-small text-muted">
        {t('verifyEmail.existing')}{' '}
        <Link href={withNext('/sign-in', next)} className="font-semibold text-ink underline">
          {t('verifyEmail.signIn')}
        </Link>
      </p>
    </>
  );
}
