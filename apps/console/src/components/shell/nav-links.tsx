'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@radd/ui';

import { isActivePath } from '@/lib/navigation';

export interface NavLink {
  href: string;
  label: string;
}

/** The shell's links; the current page is marked for screen readers and visually. */
export function NavLinks({
  links,
  label,
  onNavigate,
}: {
  links: readonly NavLink[];
  label: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1">
        {links.map((link) => {
          const current = isActivePath(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'flex min-h-11 items-center rounded-input border-s-4 px-3 text-body',
                  current
                    ? 'border-primary bg-line/50 font-semibold text-ink'
                    : 'border-transparent text-ink hover:bg-line/40',
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
