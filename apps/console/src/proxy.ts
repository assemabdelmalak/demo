import { type NextRequest, NextResponse } from 'next/server';

import { normalizeRequestId, REQUEST_ID_HEADER } from '@radd/shared';

import { PATH_HEADER } from './lib/request-path';

/**
 * Gives every request an ID (P0-T09): kept when the caller sent a valid one, otherwise minted.
 * Server code reads it from the request headers and forwards it to the API (lib/api.server.ts),
 * and the response carries it so a user-reported problem can be traced through every log.
 *
 * It also passes the requested path and query to server components, which Next.js does not give
 * layouts, so a signed-out visitor can be sent to sign-in and back to the same page. The value
 * is always overwritten here, never taken from the client.
 */
export function proxy(request: NextRequest): NextResponse {
  const requestId = normalizeRequestId(request.headers.get(REQUEST_ID_HEADER));
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set(PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Build assets and images need no ID.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
