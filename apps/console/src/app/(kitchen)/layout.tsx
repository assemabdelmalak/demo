import { type ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { requireShell } from '@/lib/session.server';

/** The kitchen display arrives in P4-T10; this shell keeps its URL stable. */
export default async function KitchenLayout({ children }: { children: ReactNode }) {
  const context = await requireShell('kitchen');
  return (
    <AppShell shell="kitchen" context={context}>
      {children}
    </AppShell>
  );
}
