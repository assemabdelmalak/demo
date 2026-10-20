'use client';

import { Dialog as SheetPrimitive } from 'radix-ui';
import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

/** `start`/`end` are logical sides, so a side sheet opens from the correct edge in RTL. */
export type SheetSide = 'bottom' | 'start' | 'end';

const SIDE_CLASSES: Record<SheetSide, string> = {
  bottom: 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-sheet',
  start: 'inset-y-0 start-0 h-full w-[min(24rem,90vw)]',
  end: 'inset-y-0 end-0 h-full w-[min(24rem,90vw)]',
};

export interface SheetContentProps extends ComponentProps<typeof SheetPrimitive.Content> {
  side?: SheetSide;
}

/** Radix Dialog underneath: focus is trapped while open and returned to the trigger on close (UX §9). */
export function SheetContent({
  side = 'bottom',
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-40 bg-black/40"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col gap-4 overflow-y-auto bg-surface p-4 text-ink shadow-xl transition-transform duration-[var(--duration-sheet)] ease-out',
          SIDE_CLASSES[side],
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-title font-semibold', className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-small text-muted', className)}
      {...props}
    />
  );
}
