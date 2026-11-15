'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useApiClient } from '@radd/api-client/react';
import { type CreateOrganizationInput, createOrganizationSchema } from '@radd/shared/dto';
import { Field, Input } from '@radd/ui';

import { FailureAlert, useFieldMessage } from '@/components/auth/form-messages';
import { SubmitButton } from '@/components/auth/submit-button';
import { type Failure, runApi } from '@/lib/auth-errors';
import { homeForRole, signInHref } from '@/lib/navigation';

export function OrganizationForm() {
  const t = useTranslations('auth.onboarding');
  const message = useFieldMessage();
  const router = useRouter();
  const api = useApiClient();
  const [failure, setFailure] = useState<Failure | null>(null);
  // One key per name: retrying the same name after a lost response replays the first result
  // instead of creating a second organisation (ADR-015); a new name gets a new key.
  const [attempt, setAttempt] = useState<{ name: string; key: string } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '' },
  });

  const onSubmit = handleSubmit(async ({ name }) => {
    setFailure(null);
    const current = attempt?.name === name ? attempt : { name, key: crypto.randomUUID() };
    setAttempt(current);
    const key = current.key;
    const result = await runApi(() =>
      api.POST('/v1/organizations', {
        body: { name },
        params: { header: { 'idempotency-key': key } },
      }),
    );
    if (result.ok) {
      router.replace(homeForRole('owner'));
      return;
    }
    if (result.failure.kind === 'code' && result.failure.code === 'UNAUTHENTICATED') {
      router.replace(signInHref('/onboarding/organization'));
      return;
    }
    // A 4xx outcome is final for this key (ADR-015); the next attempt needs a fresh one.
    if (result.failure.kind !== 'network') setAttempt(null);
    setFailure(result.failure);
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
      <Field
        label={t('name')}
        hint={t('nameHint')}
        error={message('organizationName', errors.name)}
        required
      >
        {(wiring) => <Input autoComplete="organization" {...wiring} {...register('name')} />}
      </Field>
      <SubmitButton pending={isSubmitting}>{t('submit')}</SubmitButton>
    </form>
  );
}
