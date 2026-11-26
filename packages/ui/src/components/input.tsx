import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';

/**
 * Inputs share this look (UX §4: 10 px radius). The border uses `muted`, not `line`: a field's
 * edge must reach 3:1 against the surface (WCAG 1.4.11), and `line` is a divider colour.
 * 16 px text keeps iOS from zooming into the field (UX §2: forms 16 px).
 */
export const inputClasses =
  'min-h-11 w-full rounded-input border border-muted bg-surface px-3 text-body text-ink transition-colors placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-text aria-invalid:border-2';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type ?? 'text'}
      className={cn(inputClasses, className)}
      {...props}
    />
  );
}
