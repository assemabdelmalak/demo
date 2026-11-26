'use client';

import { useTranslations } from 'next-intl';
import { type ComponentProps, useState } from 'react';

import { cn, Input } from '@radd/ui';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type'>;

/**
 * A password field with a show/hide control. The control is a separate button after the input
 * (not inside the label), so it has its own name and does not change the field's label.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const t = useTranslations('auth.common');
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        // Browsers and password managers keep working when the type flips to text.
        spellCheck={false}
        autoCapitalize="off"
        className={cn('pe-12', className)}
        {...props}
      />
      <button
        type="button"
        aria-pressed={visible}
        aria-label={t('showPassword')}
        onClick={() => {
          setVisible((shown) => !shown);
        }}
        className="absolute inset-y-0 end-0 flex min-h-11 w-11 items-center justify-center rounded-input text-muted hover:text-ink"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? null : <path d="m4 4 16 16" />}
        </svg>
      </button>
    </div>
  );
}
