import createClient, { type Client, type ClientOptions } from 'openapi-fetch';

import { type paths } from './generated/openapi.js';

export type ApiClient = Client<paths>;

export interface ApiClientOptions {
  /** API origin, e.g. `http://localhost:4000`; from the runtime public env (ADR-012). */
  baseUrl: string;
  /** Extra headers on every request, e.g. a forwarded `x-request-id` on the server (P0-T09). */
  headers?: ClientOptions['headers'];
  fetch?: ClientOptions['fetch'];
}

/**
 * Typed client generated from the OpenAPI document. `credentials: 'include'` sends the session and
 * device cookies, which live on the parent domain and are HttpOnly (API §2).
 */
export function createApiClient({ baseUrl, headers, fetch }: ApiClientOptions): ApiClient {
  return createClient<paths>({
    baseUrl,
    credentials: 'include',
    ...(headers ? { headers } : {}),
    ...(fetch ? { fetch } : {}),
  });
}
