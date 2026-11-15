'use client';

import { useState } from 'react';

import { Button, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@radd/ui';

import { type NavLink, NavLinks } from './nav-links';

/**
 * Below the `md` breakpoint the navigation lives in a sheet from the start edge (the right in
 * Arabic). Radix traps focus while it is open and returns it to the menu button.
 */
export function MobileNav({
  links,
  navLabel,
  openLabel,
  title,
}: {
  links: readonly NavLink[];
  navLabel: string;
  openLabel: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <span className="sr-only">{openLabel}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="start" aria-describedby={undefined} className="bg-background">
        <SheetTitle className="text-dish">{title}</SheetTitle>
        <NavLinks
          links={links}
          label={navLabel}
          onNavigate={() => {
            setOpen(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
