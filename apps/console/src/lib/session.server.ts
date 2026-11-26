import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { serverApiClient } from './api.server';
import {
  activeMembership,
  destinationFor,
  homeForRole,
  type Me,
  type Membership,
  ONBOARDING_PATH,
  type Shell,
  shellForRole,
  signInHref,
} from './navigation';
import { PATH_HEADER } from './request-path';

/**
 * `GET /v1/me` as the visitor, once per request (the layout and the page share it). Null means
 * signed out; any other failure throws, so the error page says the API could not be reached
 * instead of pretending the visitor is signed out.
 */
export const loadMe = cache(async (): Promise<Me | null> => {
  const { data, response } = await (await serverApiClient()).GET('/v1/me');
  if (data) return data;
  if (response.status === 401) return null;
  throw new Error(`GET /v1/me answered ${String(response.status)}`);
});

/** For pages that work signed out too (sign-in, sign-up): an unreachable API counts as signed out. */
export async function loadMeIfReachable(): Promise<Me | null> {
  try {
    return await loadMe();
  } catch {
    return null;
  }
}

/** The page the visitor asked for, from proxy.ts. */
export async function requestedPath(): Promise<string> {
  return (await headers()).get(PATH_HEADER) ?? '/';
}

/** A signed-in visitor, or a redirect to sign-in that comes back here afterwards. */
export async function requireSignedIn(): Promise<Me> {
  const me = await loadMe();
  if (!me) redirect(signInHref(await requestedPath()));
  return me;
}

export interface ShellContext {
  me: Me;
  membership: Membership | null;
}

/**
 * Gate for a signed-in route group (ADR-030): signed-out visitors go to sign-in, people without
 * an organisation to onboarding, and members whose role belongs to another shell to their own
 * home. The admin shell is for super admins only (`isSuperAdmin`, which the API sets exactly when
 * its admin guard would let the session in, ADR-027); anyone else goes where they belong.
 */
export async function requireShell(shell: Shell): Promise<ShellContext> {
  const me = await requireSignedIn();
  const membership = activeMembership(me);
  if (shell === 'admin') {
    if (!me.isSuperAdmin) redirect(destinationFor(me));
    return { me, membership };
  }
  if (!membership) redirect(ONBOARDING_PATH);
  if (shellForRole(membership.role) !== shell) redirect(homeForRole(membership.role));
  return { me, membership };
}
