'use client';

import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';
import { useThemeScopeProps } from '../theme/theme-scope.js';

// Radix handles roving focus, typeahead, Escape and returning focus to the trigger; direction
// comes from DirectionProvider, so arrow keys and the opening side follow RTL.
export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  style,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  // The portal mounts under <body>, outside a ThemeProvider's element (as in SheetContent).
  const theme = useThemeScopeProps();
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 flex min-w-56 flex-col rounded-button border border-line bg-surface p-1 text-ink shadow-lg',
          className,
        )}
        {...theme}
        style={{ ...theme?.style, ...style }}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        // 44 px rows (UX §9). Radix moves focus onto the highlighted item, so it needs a visible state.
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-input px-3 text-small outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-line/60',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('px-3 py-2 text-caption text-muted', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('my-1 h-px bg-line', className)}
      {...props}
    />
  );
}
