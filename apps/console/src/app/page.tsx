import { redirect } from 'next/navigation';

import { destinationFor, SIGN_IN_PATH } from '@/lib/navigation';
import { loadMe } from '@/lib/session.server';

/** The console's front door: sign-in, onboarding, or the role's home. */
export default async function ConsoleHomePage() {
  const me = await loadMe();
  redirect(me ? destinationFor(me) : SIGN_IN_PATH);
}
