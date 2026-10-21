import { captureRequestError, init } from '@sentry/nextjs';
import { type Instrumentation } from 'next';

/**
 * Runs once when the server starts (not at build time), so a container with missing or invalid
 * env exits immediately with the list of problems (P0-T02, ADR-012). Sentry starts only when a DSN
 * is set; the browser DSN is public by design, so server errors report to the same project.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Before any request is handled, so Sentry's copy of the headers already has the ID (ADR-019).
  const { assignRequestIds, requestIdSampler } = await import('@radd/shared/node');
  assignRequestIds();
  const { loadEnvOrExit } = await import('@radd/config/env');
  const { sentryOptions } = await import('@radd/config/observability');
  const env = loadEnvOrExit('console');
  if (env.NEXT_PUBLIC_SENTRY_DSN_CONSOLE) {
    init(
      sentryOptions({
        dsn: env.NEXT_PUBLIC_SENTRY_DSN_CONSOLE,
        release: env.GIT_SHA,
        environment: env.APP_ENV,
        tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
        keepRequestId: requestIdSampler(env.TRACE_SAMPLING_SECRET, env.SENTRY_TRACES_SAMPLE_RATE),
      }),
    );
  }
}

/** Errors from server components, route handlers and the proxy; a no-op until Sentry is set up. */
export const onRequestError: Instrumentation.onRequestError = captureRequestError;
