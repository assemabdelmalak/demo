import { type z } from 'zod';

import {
  type AppName,
  type Env,
  envSchemas,
  type PublicEnv,
  publicEnvSchemas,
  type WebAppName,
} from './schemas.js';

type Source = Readonly<Record<string, string | undefined>>;

export type EnvResult<A extends AppName> =
  { ok: true; env: Env<A> } | { ok: false; issues: readonly EnvIssue[] };

export interface EnvIssue {
  key: string;
  message: string;
}

export class EnvValidationError extends Error {
  constructor(
    readonly app: string,
    readonly issues: readonly EnvIssue[],
  ) {
    super(formatEnvIssues(app, issues));
    this.name = 'EnvValidationError';
  }
}

function toIssues(error: z.ZodError, source: Source): EnvIssue[] {
  return error.issues.map((issue) => {
    const key = issue.path.map(String).join('.') || '(root)';
    const raw = source[key];
    const missing = raw === undefined || raw === '';
    // Zod messages describe the expected shape and never echo the value, which may be a secret.
    return { key, message: missing ? 'is required' : issue.message };
  });
}

export function formatEnvIssues(app: string, issues: readonly EnvIssue[]): string {
  const lines = issues.map((issue) => `  - ${issue.key}: ${issue.message}`);
  return [
    `Invalid environment for "${app}" (${issues.length} problem${issues.length === 1 ? '' : 's'}):`,
    ...lines,
    'Copy .env.example to .env for local development, or set these variables in the deployment.',
  ].join('\n');
}

/** Pure parse, for tests and callers that want to handle failure themselves. */
export function parseEnv<A extends AppName>(app: A, source: Source): EnvResult<A> {
  const result = envSchemas[app].safeParse(source);
  if (result.success) return { ok: true, env: result.data as Env<A> };
  return { ok: false, issues: toIssues(result.error, source) };
}

/** Parses and throws `EnvValidationError` listing every missing or invalid variable. */
export function loadEnv<A extends AppName>(app: A, source: Source = process.env): Env<A> {
  const result = parseEnv(app, source);
  if (!result.ok) throw new EnvValidationError(app, result.issues);
  return result.env;
}

/**
 * Process entry points call this: on failure it prints the readable list and exits,
 * so a misconfigured container stops at boot instead of failing on first use.
 */
export function loadEnvOrExit<A extends AppName>(app: A, source: Source = process.env): Env<A> {
  try {
    return loadEnv(app, source);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

/** Only the browser-safe subset; the server hands this object to client components. */
export function loadPublicEnv<A extends WebAppName>(
  app: A,
  source: Source = process.env,
): PublicEnv<A> {
  const result = publicEnvSchemas[app].safeParse(source);
  if (!result.success)
    throw new EnvValidationError(`${app} (public)`, toIssues(result.error, source));
  return result.data as PublicEnv<A>;
}
