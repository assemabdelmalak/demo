import { AsyncLocalStorage } from 'node:async_hooks';

import { type UiLocale } from '@radd/shared';

const storage = new AsyncLocalStorage<UiLocale>();

/**
 * Better Auth hands `sendInvitationEmail` only the incoming `Request`, which a server-side
 * `auth.api.*` call does not have. Our services run those calls inside this scope so the email
 * still goes out in the language the inviter's console was using.
 */
export function runWithRequestLocale<T>(locale: UiLocale, fn: () => Promise<T>): Promise<T> {
  return storage.run(locale, fn);
}

export function currentRequestLocale(): UiLocale | undefined {
  return storage.getStore();
}
