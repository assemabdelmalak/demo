import * as Sentry from '@sentry/nestjs';

import { loadEnvOrExit } from '@radd/config/env';
import { sentryOptions } from '@radd/config/observability';
import { requestIdSampler } from '@radd/shared/node';

// main.ts imports this first: Sentry has to patch Nest, Fastify and the drivers before they load.
// Without a DSN nothing is initialised, so local runs and tests load no instrumentation.
const env = loadEnvOrExit('api');
if (env.SENTRY_DSN_API) {
  Sentry.init(
    sentryOptions({
      dsn: env.SENTRY_DSN_API,
      release: env.GIT_SHA,
      environment: env.APP_ENV,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
      keepRequestId: requestIdSampler(env.TRACE_SAMPLING_SECRET, env.SENTRY_TRACES_SAMPLE_RATE),
    }),
  );
}

/**
 * Startup failures must end the process so the container is restarted. With Sentry initialised,
 * its unhandled-rejection handler would only log them and leave a process with no listener.
 */
export async function exitOnStartupFailure(error: unknown): Promise<never> {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`api failed to start: ${detail}\n`);
  Sentry.captureException(error);
  await Sentry.close(2_000);
  process.exit(1);
}
