import { type IncomingMessage } from 'node:http';

import { normalizeRequestId, REQUEST_ID_HEADER } from '@radd/shared';

export { REQUEST_ID_HEADER };

/**
 * Fastify `genReqId`. The Next.js servers forward their request ID, so one ID follows a request
 * across services (normalizeRequestId). The normalised value is written back to the header so
 * pino-http logs the same ID.
 */
export function genRequestId(req: IncomingMessage): string {
  const id = normalizeRequestId(req.headers[REQUEST_ID_HEADER]);
  req.headers[REQUEST_ID_HEADER] = id;
  return id;
}
