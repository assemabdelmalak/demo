import type { LoggerOptions } from 'pino';

/**
 * Never log credentials, cookies, one-time codes, PINs or payment references (CLAUDE §7, SEC §2).
 * Paths cover pino-http request/response serialisation and the common field names our code uses.
 */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["proxy-authorization"]',
  'req.headers["x-device-token"]',
  'res.headers["set-cookie"]',
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
