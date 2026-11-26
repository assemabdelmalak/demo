import { type BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

import { PIN_SESSION_TTL_MS } from './pin-session';

const createPinSessionBody = z.strictObject({
  userId: z.uuid(),
  organizationId: z.uuid(),
  staffDeviceId: z.uuid(),
});

/**
 * Opens a PIN session for a member on a shared tablet (ADR-026). Server-only: Better Auth never
 * routes it over HTTP, and only `PinSwitchService` calls it, after checking the device cookie,
 * the member and the PIN. It creates the session the way Better Auth's own admin plugin does for
 * impersonation (`internalAdapter.createSession` and `setSessionCookie`), so the session and its
 * cookie are exactly Better Auth's, with three server-only fields and a 12-hour expiry.
 */
export const pinSessionPlugin = () =>
  ({
    id: 'radd-pin-session',
    endpoints: {
      createPinSession: createAuthEndpoint.serverOnly(
        { method: 'POST', body: createPinSessionBody },
        async (ctx) => {
          const { userId, organizationId, staffDeviceId } = ctx.body;
          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (!user)
            throw APIError.from('NOT_FOUND', { code: 'USER_NOT_FOUND', message: 'No user' });
          const expiresAt = new Date(Date.now() + PIN_SESSION_TTL_MS);
          // `overrideAll`: the expiry and flags given here win over Better Auth's defaults.
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            false,
            { pinSession: true, staffDeviceId, activeOrganizationId: organizationId, expiresAt },
            true,
          );
          // `dontRememberMe: false` with a 12-hour max-age: the cookie ends with the session.
          await setSessionCookie(ctx, { session, user }, false, {
            maxAge: Math.floor(PIN_SESSION_TTL_MS / 1000),
          });
          return ctx.json({ sessionId: session.id, expiresAt: session.expiresAt });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
