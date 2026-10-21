import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';

/** Loading placeholder; hidden from assistive tech, still under prefers-reduced-motion. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-button bg-line motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
