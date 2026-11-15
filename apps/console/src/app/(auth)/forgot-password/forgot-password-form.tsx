'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { type EmailOnlyInput, emailOnlySchema } from '@radd/shared/dto';
import { Field, Input } from '@radd/ui';

import { FailureAlert, useFieldMessage } from '@/components/auth/form-messages';
import { SubmitButton } from '@/components/auth/submit-button';
import { authClient } from '@/lib/auth-client';
import { type Failure, runAuth } from '@/lib/auth-errors';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const message = useFieldMessage();
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailOnlyInput>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailure(null);
    // The API answers the same for unknown addresses, so the next page reads the same too.
    const result = await runAuth(() => authClient().emailOtp.requestPasswordReset({ email }));
    if (result.ok) router.push(`/reset-password?${new URLSearchParams({ email }).toString()}`);
    else setFailure(result.failure);
  });

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
        <SubmitButton pending={isSubmitting}>{t('forgotPassword.submit')}</SubmitButton>
      </form>
      <Link href="/sign-in" className="self-start text-small font-semibold text-ink underline">
        {t('common.backToSignIn')}
      </Link>
    </>
  );
}
