'use client';

import { useTranslations } from 'next-intl';
import { type FieldError } from 'react-hook-form';

import { Alert } from '@radd/ui';

import { type Failure, failureMessage } from '@/lib/auth-errors';

/** Validation message groups under `validation`; each maps zod issue codes to a sentence. */
export type ValidationField =
  'email' | 'name' | 'organizationName' | 'newPassword' | 'password' | 'code' | 'backupCode';

/**
 * Translates a react-hook-form error. The zod resolver puts the issue code (`too_small`,
 * `invalid_format`, …) in `type`; the schema's English message is never shown.
 */
export function useFieldMessage(): (
  field: ValidationField,
  error?: FieldError,
) => string | undefined {
  const t = useTranslations('validation');
  return (field, error) => {
    if (!error) return undefined;
    const key = `${field}.${error.type}`;
    return t.has(key) ? t(key) : t('generic');
  };
}

/** A form-level failure as a translated `role="alert"` message. */
export function FailureAlert({ failure }: { failure: Failure | null }) {
  const t = useTranslations('errors');
  if (!failure) return null;
  const { key, values } = failureMessage(failure);
  return <Alert tone="danger">{t(key, values)}</Alert>;
}
