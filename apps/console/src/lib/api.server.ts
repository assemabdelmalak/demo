import { headers } from 'next/headers';

import { type ApiClient, createApiClient } from '@radd/api-client';
import { loadEnv } from '@radd/config/env';
import { REQUEST_ID_HEADER } from '@radd/shared';

/**
 * API client for server components and route handlers. It forwards the request ID set by
 * proxy.ts, so the API logs this call under the same ID as the page request (P0-T09).
 */
export async function serverApiClient(): Promise<ApiClient> {
  const requestId = (await headers()).get(REQUEST_ID_HEADER);
  return createApiClient({
    baseUrl: loadEnv('console').API_PUBLIC_URL,
    ...(requestId ? { headers: { [REQUEST_ID_HEADER]: requestId } } : {}),
  });
}
