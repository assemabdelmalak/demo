'use client';

import { type ReactNode, useId } from 'react';

import { Label } from './label.js';
import { cn } from '../lib/cn.js';

/** What a field hands its control so the label, hint and error are announced with it. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

export interface FieldProps {
  label: ReactNode;
  /** A rule or tip under the control, e.g. "At least 12 characters". */
  hint?: ReactNode;
  /** Shown under the hint, which stays, so the rule is still visible next to what went wrong. */
  error?: ReactNode;
  required?: boolean;
  /** Use a fixed ID when something outside the field points at the control. */
  id?: string;
  className?: string;
  /** Extra content on the label row's end side, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  /** Render prop, so any control (input, OTP input, select) gets the wiring without cloning. */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label, control, hint and error wired together: the control is labelled by the label and
 * described by the hint and the error, and marked invalid while there is an error.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  id,
  className,
  labelAside,
  children,
}: FieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const describedBy = [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(' ');

  return (
    <div data-slot="field" className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor={controlId}>{label}</Label>
        {labelAside}
      </div>
      {children({
        id: controlId,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(hasError ? { 'aria-invalid': true as const } : {}),
        ...(required ? { 'aria-required': true as const } : {}),
      })}
      {hint ? (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} className="text-caption font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
