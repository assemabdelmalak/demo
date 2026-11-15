'use client';

import { type Control, Controller, type FieldPath, type FieldValues } from 'react-hook-form';

import { Field, OtpInput } from '@radd/ui';

import { useFieldMessage } from './form-messages';

/** A 6-digit code field bound to a react-hook-form field. */
export function CodeField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
}) {
  const message = useFieldMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} hint={hint} error={message('code', fieldState.error)} required>
          {(wiring) => (
            <OtpInput
              {...wiring}
              ref={field.ref}
              name={field.name}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        </Field>
      )}
    />
  );
}
