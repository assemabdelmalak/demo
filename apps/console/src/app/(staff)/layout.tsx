import { type ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { requireShell } from '@/lib/session.server';

/** Floor staff: the live floor and bills. */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const context = await requireShell('staff');
  return (
    <AppShell shell="staff" context={context}>
      {children}
    </AppShell>
  );
}
