import type { LoggerOptions } from 'pino';

/**
 * Defence in depth behind the serializers below: never log credentials, cookies, one-time codes,
 * PINs, payment references or client IPs (CLAUDE §7, SEC §2).
 */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["proxy-authorization"]',
  'req.headers["x-forwarded-for"]',
  'req.headers["cf-connecting-ip"]',
  'req.headers["true-client-ip"]',
  'req.headers["x-real-ip"]',
  'req.headers.forwarded',
  'req.remoteAddress',
  'res.headers["set-cookie"]',
  'err.command',
  'error.command',
  'headers.authorization',
  'headers.cookie',
  'authorization',
  'cookie',
  'password',
  'token',
  'otp',
  'pin',
  'secret',
  'externalReference',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.otp',
  '*.pin',
  '*.secret',
  '*.apiKey',
  '*.externalReference',
  '*.*.password',
  '*.*.token',
  '*.*.otp',
  '*.*.pin',
  '*.*.externalReference',
] as const;

/** Request headers worth logging. Everything else (cookies, auth, forwarding/IP headers) is dropped. */
const LOGGED_REQUEST_HEADERS = ['user-agent', 'content-type', 'content-length', 'origin'] as const;

/**
 * Path segments that are themselves credentials. Receipt links carry a signed token in the path
 * (API §3); add a pattern here whenever a route does the same.
 */
const SECRET_PATH_SEGMENTS: readonly RegExp[] = [/(\/receipts\/)[^/]+/g];

interface SerializableRequest {
  id?: unknown;
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
}

/** Path without query string (it may carry tokens) and with secret path segments masked. */
export function safeUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const path = url.split('?', 1)[0] ?? '';
  return SECRET_PATH_SEGMENTS.reduce(
    (masked, pattern) => masked.replace(pattern, '$1[redacted]'),
    path,
  );
}

export function serializeRequest(req: SerializableRequest) {
  const headers: Record<string, unknown> = {};
  for (const name of LOGGED_REQUEST_HEADERS) {
    const value = req.headers?.[name];
    if (value !== undefined) headers[name] = value;
  }
  return { id: req.id, method: req.method, url: safeUrl(req.url), headers };
}

export function serializeResponse(res: { statusCode?: number }) {
  return { statusCode: res.statusCode };
}

/**
 * Name, message, code, stack and cause only. Client libraries attach extra properties to errors;
 * ioredis, for one, puts the full command (key and value) on `err.command`, which would put
 * stored response bodies, tokens included, into the logs.
 */
export function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { message: String(err) };
  const code = (err as { code?: unknown }).code;
  return {
    type: err.name,
    message: err.message,
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    stack: err.stack,
    ...(err.cause === undefined ? {} : { cause: serializeError(err.cause) }),
  };
}

export interface LoggerOptionsInput {
  service: string;
  level: string;
  /** Human-readable output for local development; JSON everywhere else. */
  pretty: boolean;
  release?: string;
}

export function loggerOptions({
  service,
  level,
  pretty,
  release,
}: LoggerOptionsInput): LoggerOptions {
  return {
    level,
    base: { service, ...(release ? { release } : {}) },
    redact: { paths: [...LOG_REDACT_PATHS], censor: '[redacted]' },
    serializers: { req: serializeRequest, res: serializeResponse, err: serializeError },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
          },
        }
      : {}),
  };
}
