/**
 * The signed-in user's session as the rest of the API sees it, resolved once per request by the
 * auth bridge's `onRequest` hook. Absent when the request carries no valid session cookie.
 */
export interface AuthSession {
  sessionId: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  activeOrganizationId: string | null;
  pinSession: boolean;
  staffDeviceId: string | null;
  twoFactorVerifiedAt: Date | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: AuthSession;
  }
}
