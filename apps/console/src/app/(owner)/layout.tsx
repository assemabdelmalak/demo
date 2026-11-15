import { type ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { requireShell } from '@/lib/session.server';

/** Owners and managers share this shell; the API decides what each may change (P1-T05). */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const context = await requireShell('owner');
  return (
    <AppShell shell="owner" context={context}>
      {children}
    </AppShell>
  );
}
