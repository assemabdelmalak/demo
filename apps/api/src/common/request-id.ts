import { type IncomingMessage } from 'node:http';

import { isUuid, uuidv7 } from '@radd/shared';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Fastify `genReqId`: keep a caller-supplied UUID (the Next.js servers forward theirs) so one ID
 * follows a request across services; otherwise mint a UUIDv7. Anything else is replaced, which
 * also keeps attacker-controlled text out of the logs. The normalised value is written back to the
 * header so pino-http logs the same ID.
 */
export function genRequestId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = isUuid(incoming) ? incoming : uuidv7();
  req.headers[REQUEST_ID_HEADER] = id;
  return id;
}
