import { type ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { requireShell } from '@/lib/session.server';

/**
 * Super admin (ADR-027): only sessions the API's admin guard would accept get in; everyone else is
 * sent to their own home. The pages are empty shells in Phase 1.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const context = await requireShell('admin');
  return (
    <AppShell shell="admin" context={context}>
      {children}
    </AppShell>
  );
}
