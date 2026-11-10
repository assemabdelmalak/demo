import { type NextRequest, NextResponse } from 'next/server';

import { normalizeRequestId, REQUEST_ID_HEADER } from '@radd/shared';

/**
 * Gives every request an ID (P0-T09): kept when the caller sent a valid one, otherwise minted.
 * Server code reads it from the request headers and forwards it to the API (lib/api.server.ts),
 * and the response carries it so a user-reported problem can be traced through every log.
 */
export function proxy(request: NextRequest): NextResponse {
  const requestId = normalizeRequestId(request.headers.get(REQUEST_ID_HEADER));
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Build assets and images need no ID.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
