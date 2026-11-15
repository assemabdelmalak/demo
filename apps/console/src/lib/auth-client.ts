import { emailOTPClient, organizationClient, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { readPublicEnv } from '@radd/config/public-env';
import { DEFAULT_LOCALE, isUiLocale, type UiLocale } from '@radd/shared/i18n';

import { parseRetryAfter } from './auth-errors';

/** The API reads it to send code emails in the page's language (apps/api auth.utils.ts). */
export const LOCALE_HEADER = 'x-radd-locale';

/** Better Auth's routes on the API (ADR-023). */
export const AUTH_BASE_PATH = '/v1/auth';

/**
 * Better Auth's base URL from the runtime public env (ADR-012), never from `process.env`, so one
 * image serves every environment. Throws on a missing or non-HTTP value rather than calling a
 * relative URL on the console's own origin.
 */
export function authBaseUrl(env: Record<string, unknown>): string {
  const api = env.NEXT_PUBLIC_API_URL;
  if (typeof api !== 'string')
    throw new Error('NEXT_PUBLIC_API_URL is missing from the public env');
  const url = new URL(api);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('NEXT_PUBLIC_API_URL must be an http(s) URL');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}${AUTH_BASE_PATH}`;
}

/** The page's UI language: the root layout renders it into `<html lang>` and updates it on switch. */
function currentLocale(): UiLocale {
  const lang = document.documentElement.lang;
  return isUiLocale(lang) ? lang : DEFAULT_LOCALE;
}

/**
 * Better Auth's 429 body carries no wait time; the API sends it as `Retry-After`. Folding it into
 * the JSON makes it part of the client's `error` object, where the forms read it.
 */
async function withRetryAfter(response: Response): Promise<Response> {
  const seconds = parseRetryAfter(
    response.headers.get('retry-after') ?? response.headers.get('x-retry-after'),
  );
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.clone().json();
    if (parsed !== null && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    // Not JSON; the status alone still says what happened.
  }
  return new Response(JSON.stringify({ ...body, code: 'RATE_LIMITED', retryAfter: seconds }), {
    status: 429,
    statusText: response.statusText,
    headers: { 'content-type': 'application/json' },
  });
}

function create(baseURL: string) {
  return createAuthClient({
    baseURL,
    fetchOptions: {
      // The session cookie belongs to the API's site (same-site with the console, API §2).
      credentials: 'include',
      onRequest: (context) => {
        context.headers.set(LOCALE_HEADER, currentLocale());
      },
      onResponse: async (context) => {
        if (context.response.status === 429) return withRetryAfter(context.response);
      },
    },
    plugins: [emailOTPClient(), organizationClient(), twoFactorClient()],
  });
}

export type AuthClient = ReturnType<typeof create>;

let client: AuthClient | undefined;

/**
 * The Better Auth client, created on first use in the browser: the public env is read from the
 * page, which does not exist while the server renders client components. Call it from event
 * handlers and effects only.
 */
export function authClient(): AuthClient {
  client ??= create(authBaseUrl(readPublicEnv()));
  return client;
}
