'use client';

import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactNode } from 'react';

import { Button, type ButtonProps } from '@radd/ui';

/**
 * A submit button that shows progress without `disabled`: disabling the focused button would
 * drop keyboard focus to <body> just before the result is announced. A click while pending is
 * swallowed instead.
 */
export function SubmitButton({
  pending,
  children,
  onClick,
  ...props
}: Omit<ButtonProps, 'type'> & { pending: boolean; children: ReactNode }) {
  const t = useTranslations('auth.common');
  return (
    <Button
      type="submit"
      aria-disabled={pending}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (pending) event.preventDefault();
        else onClick?.(event);
      }}
      {...props}
    >
      {pending ? t('working') : children}
    </Button>
  );
}
