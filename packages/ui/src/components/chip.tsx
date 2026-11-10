import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';

export interface ChipProps extends Omit<ComponentProps<'button'>, 'aria-pressed'> {
  /** Toggle state for filter chips; announced to screen readers via aria-pressed. */
  selected?: boolean;
}

export function Chip({ className, selected = false, type, ...props }: ChipProps) {
  return (
    <button
      data-slot="chip"
      type={type ?? 'button'}
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-chip border px-3 text-small transition-colors',
        selected
          ? 'border-primary bg-primary text-on-primary'
          : 'border-line bg-surface text-ink hover:bg-line/40',
        className,
      )}
      {...props}
    />
  );
}
