'use client';

import { Toast as ToastPrimitive } from 'radix-ui';
import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';

export const ToastProvider = ToastPrimitive.Provider;
export const ToastAction = ToastPrimitive.Action;
export const ToastClose = ToastPrimitive.Close;

/** Radix toasts are announced through an ARIA live region (UX §9). */
export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        'fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-2 p-4 outline-none sm:inset-x-auto sm:end-0 sm:w-96',
        className,
      )}
      {...props}
    />
  );
}

export interface ToastProps extends ComponentProps<typeof ToastPrimitive.Root> {
  tone?: 'neutral' | 'success' | 'danger';
}

const TONES = {
  neutral: 'border-line',
  success: 'border-success',
  danger: 'border-danger',
} as const;

export function Toast({ tone = 'neutral', className, ...props }: ToastProps) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        'flex items-start gap-3 rounded-button border-s-4 bg-surface p-4 text-ink shadow-lg',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function ToastTitle({ className, ...props }: ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn('font-semibold', className)}
      {...props}
    />
  );
}

export function ToastDescription({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn('text-small text-muted', className)}
      {...props}
    />
  );
}
