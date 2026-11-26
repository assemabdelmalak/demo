import { type LoggerService } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import {
  ADDRESS_CODE_LIMIT,
  requestAddress,
  SIGN_IN_PATH,
  type SignInLockout,
} from './address-limits';
import { type AuthRateLimitStorage } from './auth-rate-limit';
import { type AuthSession } from './auth-session';
import { type Auth } from './auth.config';
import { authUrlParts, CLIENT_IP_HEADER, toAuthClientIp } from './auth.utils';
import { PIN_SESSION_AUTH_PATHS, type PinSessionGate } from './pin-session';
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
  /** The extra caps on code emails, per IP and per address (ADR-034); on unless a test turns them off. */
  codeRequestLimit: boolean;
  /** The per-address pause after wrong passwords (ADR-034); undefined when a test turns it off. */
  signInLockout: SignInLockout | undefined;
  logger: LoggerService;
  /** Confines shared-tablet PIN sessions to their device (ADR-026). */
  pinSessions: PinSessionGate;
}

/** Better Auth's error shape, so its client handles the refusal like its own. */
const PIN_SESSION_FORBIDDEN = {
  code: 'PIN_SESSION_FORBIDDEN',
  message: 'Not available in a device session',
};

/**
 * What the bridge does with a `/v1/auth/*` request that carries a PIN session (ADR-026):
 * `forward` it to Better Auth (with refresh switched off for get-session), answer `signed_out`
 * (get-session's `null`), or `refuse` it. A PIN session may only read itself and sign out; when
 * it has just been ended (expired, device revoked) nothing is left to confine.
 */
export type PinAuthDecision = 'forward' | 'forward_no_refresh' | 'signed_out' | 'refuse';

export function pinAuthDecision(
  path: string,
  verdict: { ok: boolean; end?: boolean },
): PinAuthDecision {
  if (!verdict.ok && verdict.end) return 'forward';
  if (!PIN_SESSION_AUTH_PATHS.has(path)) return 'refuse';
  if (path === '/sign-out') return 'forward';
  return verdict.ok ? 'forward_no_refresh' : 'signed_out';
}

/** The auth-relative path (`/sign-in/email`), with duplicate and trailing slashes removed. */
export function authRelativePath(url: string, basePath: string): string {
  const pathname = new URL(url, 'http://auth.invalid').pathname.replace(/\/{2,}/g, '/');
  const relative = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
  const trimmed = relative.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Whether a `Cookie` header carries the named cookie, written the way browsers write it. Only a
 * fast path where a miss fails closed (no session resolved); never use it to decide whether a
 * request escapes a restriction, because Better Auth's parser also accepts other spellings.
 */
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
  { limiter, codeRequestLimit, signInLockout, logger, pinSessions }: RegisterAuthDeps,
): Promise<void> {
  const { origin, basePath } = authUrlParts(env.BETTER_AUTH_URL);
  const typeBase = problemTypeBase(env.APP_DOMAIN);
  const sessionCookie = (await auth.$context).authCookies.sessionToken.name;

  /** Whether the request's session is a PIN session, and if so what it may do here. */
  const pinSessionDecision = async (
    request: FastifyRequest,
    path: string,
  ): Promise<PinAuthDecision> => {
    const result = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: { disableRefresh: true },
    });
    if (!result?.session.pinSession) return 'forward';
    const verdict = await pinSessions.check(
      {
        sessionId: result.session.id,
        staffDeviceId: result.session.staffDeviceId ?? null,
        createdAt: result.session.createdAt,
      },
      request.headers.cookie,
    );
    return pinAuthDecision(path, verdict);
  };

  fastify.route({
    method: ['GET', 'POST'],
    url: `${basePath}/*`,
    handler: async (request, reply) => {
      try {
        const path = authRelativePath(request.url, basePath);
        const tooMany = (retryAfter: number) =>
          reply.status(429).header('retry-after', String(retryAfter)).send(TOO_MANY_REQUESTS);
        const address = request.method === 'POST' ? requestAddress(request.body) : undefined;
        if (codeRequestLimit && request.method === 'POST' && CODE_REQUEST_PATHS.has(path)) {
          const { allowed, retryAfter } = await limiter.consume(
            `codes|${request.clientIp ?? request.ip}`,
            CODE_REQUEST_LIMIT,
          );
          if (!allowed) return await tooMany(retryAfter ?? CODE_REQUEST_LIMIT.window);
          if (address) {
            const perAddress = await limiter.consume(
              `codes-address|${address}`,
              ADDRESS_CODE_LIMIT,
            );
            if (!perAddress.allowed) {
              return await tooMany(perAddress.retryAfter ?? ADDRESS_CODE_LIMIT.window);
            }
          }
        }
        // While paused, even the right password is refused: otherwise a 200 among the 429s
        // would still tell a guesser they had found it.
        const lockedAddress =
          signInLockout && request.method === 'POST' && path === SIGN_IN_PATH ? address : undefined;
        if (signInLockout && lockedAddress) {
          const verdict = await signInLockout.check(lockedAddress);
          if (verdict.locked) return await tooMany(verdict.retryAfter ?? 1);
        }

        const url = new URL(request.url, origin);
        // Any Cookie header at all: whether it carries a session is Better Auth's own reading,
        // not ours. A check of our own let `name =value` past while Better Auth read it as the
        // session (security review of Phase 1), and the confinement must never depend on it.
        if (request.headers.cookie) {
          const decision = await pinSessionDecision(request, path);
          if (decision === 'refuse') return await reply.status(403).send(PIN_SESSION_FORBIDDEN);
          if (decision === 'signed_out') {
            return await reply.status(200).type('application/json').send('null');
          }
          // Reading the session must never slide a PIN session past its 12 hours.
          if (decision === 'forward_no_refresh') url.searchParams.set('disableRefresh', 'true');
        }

        const headers = fromNodeHeaders(request.headers);
        for (const name of BODY_FRAMING_HEADERS) headers.delete(name);
        // Overwritten on every request: a client-sent value must never reach Better Auth.
        headers.delete(CLIENT_IP_HEADER);
        const clientIp = toAuthClientIp(request.clientIp);
        if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp);

        const response = await auth.handler(
          new Request(url, {
            method: request.method,
            headers,
            body: requestBody(request),
          }),
        );
        if (signInLockout && lockedAddress) {
          await signInLockout.record(lockedAddress, response.status);
        }
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
      let activeOrganizationId = session.activeOrganizationId ?? null;
      if (session.pinSession) {
        // Device-bound (ADR-026): valid only with its own device's cookie, within 12 hours, and
        // always in the device's organisation, whatever the session row says.
        const verdict = await pinSessions.check(
          {
            sessionId: session.id,
            staffDeviceId: session.staffDeviceId ?? null,
            createdAt: session.createdAt,
          },
          request.headers.cookie,
        );
        if (!verdict.ok) return;
        activeOrganizationId = verdict.organizationId;
      }
      const authSession: AuthSession = {
        sessionId: session.id,
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        activeOrganizationId,
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
