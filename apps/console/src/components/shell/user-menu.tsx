'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  Alert,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@radd/ui';

import { authClient } from '@/lib/auth-client';
import { runAuth } from '@/lib/auth-errors';
import { SIGN_IN_PATH } from '@/lib/navigation';

/** The signed-in person's menu: who they are, two-factor settings and sign out. */
export function UserMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations('shell');
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setFailed(false);
    const result = await runAuth(() => authClient().signOut());
    if (!result.ok) {
      // The session would still be valid; say so instead of pretending.
      setFailed(true);
      return;
    }
    router.replace(SIGN_IN_PATH);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-chip">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
            </svg>
            <span className="sr-only">{t('account')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>
            <span className="block text-small font-semibold text-ink">{name}</span>
            {t.rich('signedInAs', { address: email, email: (chunks) => <bdi>{chunks}</bdi> })}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              router.push('/two-factor');
            }}
          >
            {t('twoFactor')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void signOut();
            }}
          >
            {t('signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {failed ? (
        <div className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:end-4 sm:w-96">
          <Alert tone="danger">{t('signOutFailed')}</Alert>
        </div>
      ) : null}
    </>
  );
}
