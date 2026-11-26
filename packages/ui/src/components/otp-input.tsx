'use client';

import { type ClipboardEvent, type ComponentProps } from 'react';

import { inputClasses } from './input.js';
import { cn } from '../lib/cn.js';

/** Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits → Latin. */
function toLatinDigit(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return char;
}

/**
 * Keeps only digits, as Latin digits, at most `length` of them. An Arabic keyboard types ٤٢,
 * and a pasted code often carries spaces or a dash ("123 456"); codes are always Latin (UX §5).
 */
export function normalizeCode(raw: string, length: number): string {
  return Array.from(raw, toLatinDigit)
    .filter((char) => char >= '0' && char <= '9')
    .join('')
    .slice(0, length);
}

export interface OtpInputProps extends Omit<
  ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode' | 'maxLength' | 'dir'
> {
  value: string;
  onChange: (value: string) => void;
  /** Called once when the last digit arrives, e.g. to submit the form. */
  onComplete?: (code: string) => void;
  length?: number;
}

/**
 * One text input for a numeric code, not one box per digit: a screen reader announces one
 * labelled field, the platform's one-time-code autofill fills it, and pasting works. Always left
 * to right, also on Arabic pages, because the digits are read in that order.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  className,
  onPaste,
  ...props
}: OtpInputProps) {
  function update(raw: string) {
    const next = normalizeCode(raw, length);
    if (next === value) return;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  }

  function paste(event: ClipboardEvent<HTMLInputElement>) {
    onPaste?.(event);
    if (event.defaultPrevented) return;
    // Handled here so separators in the pasted text do not count against the length.
    event.preventDefault();
    update(event.clipboardData.getData('text'));
  }

  return (
    <input
      data-slot="otp-input"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      dir="ltr"
      value={value}
      onChange={(event) => {
        update(event.target.value);
      }}
      onPaste={paste}
      className={cn(
        inputClasses,
        // Letter spacing also follows the last digit; the start padding balances it.
        'max-w-60 ps-[calc(0.75rem+0.5em)] text-center font-mono text-title tracking-[0.5em] tabular-nums',
        className,
      )}
      {...props}
    />
  );
}
