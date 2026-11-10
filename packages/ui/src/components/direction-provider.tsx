'use client';

import { Direction } from 'radix-ui';
import { type ReactNode } from 'react';

/**
 * Radix primitives take their direction from this context, not from `<html dir>`; without it they
 * render left to right on Arabic pages and their arrow keys run the wrong way. Each app's root
 * layout mounts it with the page direction.
 */
export function DirectionProvider({ dir, children }: { dir: 'ltr' | 'rtl'; children: ReactNode }) {
  return <Direction.Provider dir={dir}>{children}</Direction.Provider>;
}
