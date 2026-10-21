import { subscribe } from 'node:diagnostics_channel';
import { type IncomingMessage } from 'node:http';

import { normalizeRequestId, REQUEST_ID_HEADER } from './ids.js';

let assigning = false;

/**
 * Node servers only. Gives every incoming request its `x-request-id` the moment Node starts
 * handling it, before anything reads the headers. Sentry copies them when the request is emitted,
 * before Next's proxy or Fastify run, so an ID minted later never reached the server's spans and
 * a page request could not be matched to the API calls it made (ADR-019). The proxy and the API
 * then keep this ID. Safe to call more than once.
 */
export function assignRequestIds(): void {
  if (assigning) return;
  assigning = true;
  subscribe('http.server.request.start', (message) => {
    const { request } = message as { request: IncomingMessage };
    request.headers[REQUEST_ID_HEADER] = normalizeRequestId(request.headers[REQUEST_ID_HEADER]);
  });
}
