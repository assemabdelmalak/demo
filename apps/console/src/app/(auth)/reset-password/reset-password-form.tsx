'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { type ResetPasswordInput, resetPasswordSchema } from '@radd/shared/dto';
import { Field, Input } from '@radd/ui';

import { CodeField } from '@/components/auth/code-field';
import { FailureAlert, useFieldMessage } from '@/components/auth/form-messages';
import { PasswordInput } from '@/components/auth/password-input';
import { ResendCode } from '@/components/auth/resend-code';
import { SubmitButton } from '@/components/auth/submit-button';
import { authClient } from '@/lib/auth-client';
import { type Failure, runAuth } from '@/lib/auth-errors';

export function ResetPasswordForm({ email }: { email: string }) {
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
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email, otp: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    const result = await runAuth(() => authClient().emailOtp.resetPassword(values));
    // Every session ends on a reset (revokeSessionsOnPasswordReset), so the next step is sign-in.
    if (result.ok) router.replace('/sign-in?reset=done');
    else setFailure(result.failure);
  });

  async function resend() {
    if (!(await trigger('email'))) return null;
    return runAuth(() =>
      authClient().emailOtp.requestPasswordReset({
        email: resetPasswordSchema.shape.email.parse(getValues('email')),
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
        <Field
          label={t('common.newPassword')}
          hint={t('common.passwordHint')}
          error={message('newPassword', errors.password)}
          required
        >
          {(wiring) => (
            <PasswordInput autoComplete="new-password" {...wiring} {...register('password')} />
          )}
        </Field>
        <SubmitButton pending={isSubmitting}>{t('resetPassword.submit')}</SubmitButton>
      </form>
      <ResendCode send={resend} sentOnArrival={email !== ''} />
      <Link href="/sign-in" className="self-start text-small font-semibold text-ink underline">
        {t('common.backToSignIn')}
      </Link>
    </>
  );
}
