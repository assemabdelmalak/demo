'use client';

import { Label as LabelPrimitive } from 'radix-ui';
import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';

/** Radix Label: a click focuses the control and double clicks do not select the text. */
export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn('text-small font-semibold text-ink', className)}
      {...props}
    />
  );
}
