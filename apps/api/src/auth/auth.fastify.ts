import { type LoggerService } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { type AuthRateLimitStorage } from './auth-rate-limit';
import { type AuthSession } from './auth-session';
import { type Auth } from './auth.config';
import { authUrlParts, CLIENT_IP_HEADER, toAuthClientIp } from './auth.utils';
import { problemTypeBase, toProblem } from '../common/problem';
import { sendProblem } from '../common/problem.filter';
import { type ApiEnv } from '../config/env.module';

/** Endpoints that email a code. Better Auth allows 3 a minute per IP and path; this caps the total. */
export const CODE_REQUEST_PATHS: ReadonlySet<string> = new Set([
  '/email-otp/send-verification-otp',
  '/email-otp/request-password-reset',
]);
export const CODE_REQUEST_LIMIT = { window: 15 * 60, max: 10 } as const;

/** Better Auth's own 429 body, so its client handles both limits the same way. */
const TOO_MANY_REQUESTS = { message: 'Too many requests. Please try again later.' };

/** Request headers that describe the original body; the bridge re-serialises it. */
const BODY_FRAMING_HEADERS = ['content-length', 'transfer-encoding'] as const;

export interface RegisterAuthDeps {
  limiter: AuthRateLimitStorage;
  /** The extra per-IP cap on code emails; on unless a test turns it off. */
  codeRequestLimit: boolean;
  logger: LoggerService;
}

/** The auth-relative path (`/sign-in/email`), with duplicate and trailing slashes removed. */
export function authRelativePath(url: string, basePath: string): string {
  const pathname = new URL(url, 'http://auth.invalid').pathname.replace(/\/{2,}/g, '/');
  const relative = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
  const trimmed = relative.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Whether a `Cookie` header carries the named cookie. */
export function hasCookie(header: string | undefined, name: string): boolean {
  if (!header) return false;
  return header.split(';').some((part) => part.trimStart().startsWith(`${name}=`));
}

/** Fastify's parsed body back into the bytes Better Auth expects. */
function requestBody(request: FastifyRequest): string | undefined {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const body: unknown = request.body;
  if (body === undefined || body === null) return undefined;
  return typeof body === 'string' ? body : JSON.stringify(body);
}

async function forward(reply: FastifyReply, response: Response): Promise<FastifyReply> {
  void reply.status(response.status);
  response.headers.forEach((value, key) => {
    // Set-Cookie is folded by `forEach`; each cookie must stay its own header.
    if (key === 'set-cookie' || key === 'content-length') return;
    void reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) void reply.header('set-cookie', cookies);
  // Better Auth sends only X-Retry-After; the standard header is the one CORS exposes.
  const retryAfter = response.headers.get('x-retry-after');
  if (response.status === 429 && retryAfter && !response.headers.has('retry-after')) {
    void reply.header('retry-after', retryAfter);
  }
  const text = await response.text();
  return reply.send(text === '' ? undefined : text);
}

/**
 * Mounts Better Auth at `/v1/auth/*` as a raw Fastify route, so its responses keep Better Auth's
 * JSON shape (its client depends on it; API.md records the exception), and resolves the session
 * cookie into `request.principal` for every other route. Must be called after the hook that sets
 * `request.clientIp`, and before the app starts listening.
 */
export async function registerAuth(
  fastify: FastifyInstance,
  auth: Auth,
  env: ApiEnv,
  { limiter, codeRequestLimit, logger }: RegisterAuthDeps,
): Promise<void> {
  const { origin, basePath } = authUrlParts(env.BETTER_AUTH_URL);
  const typeBase = problemTypeBase(env.APP_DOMAIN);
  const sessionCookie = (await auth.$context).authCookies.sessionToken.name;

  fastify.route({
    method: ['GET', 'POST'],
    url: `${basePath}/*`,
    handler: async (request, reply) => {
      try {
        const path = authRelativePath(request.url, basePath);
        if (codeRequestLimit && request.method === 'POST' && CODE_REQUEST_PATHS.has(path)) {
          const { allowed, retryAfter } = await limiter.consume(
            `codes|${request.clientIp ?? request.ip}`,
            CODE_REQUEST_LIMIT,
          );
          if (!allowed) {
            return await reply
              .status(429)
              .header('retry-after', String(retryAfter ?? CODE_REQUEST_LIMIT.window))
              .send(TOO_MANY_REQUESTS);
          }
        }

        const headers = fromNodeHeaders(request.headers);
        for (const name of BODY_FRAMING_HEADERS) headers.delete(name);
        // Overwritten on every request: a client-sent value must never reach Better Auth.
        headers.delete(CLIENT_IP_HEADER);
        const clientIp = toAuthClientIp(request.clientIp);
        if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp);

        const response = await auth.handler(
          new Request(new URL(request.url, origin), {
            method: request.method,
            headers,
            body: requestBody(request),
          }),
        );
        return await forward(reply, response);
      } catch (error) {
        logger.error(
          { err: error, requestId: request.id, route: `${basePath}/*` },
          'auth handler failed',
        );
        sendProblem(reply, request, toProblem(error, typeBase), typeBase);
        return reply;
      }
    },
  });

  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith(`${basePath}/`) || request.url.startsWith('/v1/health/')) return;
    if (!hasCookie(request.headers.cookie, sessionCookie)) return;
    try {
      // `disableRefresh`: reading the session must not extend it on every API call; Better Auth's
      // own `/get-session`, which the console calls, does the sliding refresh.
      const result = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
        query: { disableRefresh: true },
      });
      if (!result) return;
      const { session, user } = result;
      const authSession: AuthSession = {
        sessionId: session.id,
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        activeOrganizationId: session.activeOrganizationId ?? null,
        pinSession: session.pinSession ?? false,
        staffDeviceId: session.staffDeviceId ?? null,
        twoFactorVerifiedAt: session.twoFactorVerifiedAt ?? null,
        twoFactorEnabled: user.twoFactorEnabled ?? false,
        createdAt: session.createdAt,
      };
      request.authSession = authSession;
      request.principal = { ...request.principal, userId: user.id };
    } catch (error) {
      // Treated as signed out: the route answers 401 if it needs a session, never 500.
      logger.warn({ err: error, requestId: request.id }, 'could not resolve the session');
    }
  });
}
