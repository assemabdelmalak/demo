import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';

export const buttonVariants = cva(
  // 44 px minimum tap target (UX §9); logical properties keep icons on the right side in RTL.
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-button px-4 text-body font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:opacity-90',
        secondary: 'border border-line bg-surface text-ink hover:bg-line/40',
        ghost: 'text-ink hover:bg-line/40',
        danger: 'bg-danger text-white hover:opacity-90',
      },
      size: {
        md: 'h-11',
        sm: 'min-h-9 h-9 px-3 text-small',
        icon: 'size-11 px-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a link) with button styling instead of a <button>. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      data-slot="button"
      // Never let a button default to submitting a surrounding form.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
