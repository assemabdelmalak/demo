'use client';

import { Avatar as AvatarPrimitive } from 'radix-ui';
import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';
import { isHexColor, readableOn } from '../lib/contrast.js';

export interface AvatarProps extends ComponentProps<typeof AvatarPrimitive.Root> {
  /** Display name; its initials are the fallback. */
  name: string;
  src?: string | undefined;
  /** Participant colour from PARTICIPANT_PALETTE. */
  color?: string | undefined;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]];
  return letters
    .map((part) => Array.from(part ?? '')[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

export function Avatar({ name, src, color, className, ...props }: AvatarProps) {
  // Participant colours range from yellow to navy, so the initials take whichever of black or white
  // reads better (AA); the default muted background takes white.
  const background = color ?? 'var(--muted)';
  const foreground = color && isHexColor(color) ? readableOn(color) : '#ffffff';
  return (
    // One accessible name for the whole avatar, whether the photo or the initials show.
    <AvatarPrimitive.Root
      data-slot="avatar"
      role="img"
      aria-label={name}
      className={cn('relative inline-flex size-9 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    >
      {src ? <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        aria-hidden="true"
        className="flex size-full items-center justify-center text-small font-semibold"
        style={{ backgroundColor: background, color: foreground }}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
