import { type ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { requireShell } from '@/lib/session.server';

/**
 * Super admin. Only sign-in is checked so far: `/v1/me` does not yet say who is a super admin, so
 * no shell links here and the pages hold nothing. The admin guard is P1-T06.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const context = await requireShell('admin');
  return (
    <AppShell shell="admin" context={context}>
      {children}
    </AppShell>
  );
}
