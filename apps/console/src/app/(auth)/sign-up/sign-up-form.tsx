'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { type SignUpInput, signUpSchema } from '@radd/shared/dto';
import { Field, Input } from '@radd/ui';

import { FailureAlert, useFieldMessage } from '@/components/auth/form-messages';
import { PasswordInput } from '@/components/auth/password-input';
import { SubmitButton } from '@/components/auth/submit-button';
import { authClient } from '@/lib/auth-client';
import { type Failure, runAuth } from '@/lib/auth-errors';
import { verifyEmailHref, withNext } from '@/lib/navigation';

export function SignUpForm({ next }: { next: string | null }) {
  const t = useTranslations('auth');
  const message = useFieldMessage();
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    const result = await runAuth(() => authClient().signUp.email(values));
    // An address that already has an account gets the same answer (no session, no hint), so the
    // next step is the same either way and nobody learns whether the address is registered.
    if (result.ok) router.push(verifyEmailHref(values.email, next));
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
        <Field label={t('common.name')} error={message('name', errors.name)} required>
          {(control) => <Input autoComplete="name" {...control} {...register('name')} />}
        </Field>
        <Field label={t('common.email')} error={message('email', errors.email)} required>
          {(control) => (
            <Input
              type="email"
              autoComplete="email"
              dir="ltr"
              {...control}
              {...register('email')}
            />
          )}
        </Field>
        <Field
          label={t('common.password')}
          hint={t('common.passwordHint')}
          error={message('newPassword', errors.password)}
          required
        >
          {(control) => (
            <PasswordInput autoComplete="new-password" {...control} {...register('password')} />
          )}
        </Field>
        <SubmitButton pending={isSubmitting}>{t('signUp.submit')}</SubmitButton>
      </form>
      <p className="text-small text-muted">
        {t('signUp.haveAccount')}{' '}
        <Link href={withNext('/sign-in', next)} className="font-semibold text-ink underline">
          {t('signUp.signIn')}
        </Link>
      </p>
    </>
  );
}
