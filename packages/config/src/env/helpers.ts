import { z } from 'zod';

/** `.env` files write unset values as `KEY=`; treat them as missing. */
export const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

export const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

export const requiredString = z.preprocess(emptyToUndefined, z.string().min(1));

export const url = z.preprocess(emptyToUndefined, z.url());

export const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());

export const port = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535));

export const positiveInt = z.preprocess(emptyToUndefined, z.coerce.number().int().positive());

export const bool = z.preprocess(emptyToUndefined, z.stringbool());

/** Comma-separated list, e.g. `TRUSTED_ORIGINS=http://a,http://b`. */
export function csv<T extends z.ZodType>(item: T, { min = 0 }: { min?: number } = {}) {
  return z.preprocess(
    (value: unknown) =>
      typeof value === 'string'
        ? value
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
        : value,
    z.array(item).min(min),
  );
}

export const appEnv = z.enum(['local', 'test', 'staging', 'production']);
export type AppEnv = z.infer<typeof appEnv>;

/** Value shipped in `.env.example`; acceptable on a laptop, never on a server. */
export const PLACEHOLDER_SECRET = 'change-me';
export const MIN_SECRET_LENGTH = 32;

const DEPLOYED_ENVS: readonly AppEnv[] = ['staging', 'production'];

/**
 * Rejects placeholder or short secrets when APP_ENV is staging or production.
 * Local and test runs accept the `.env.example` placeholders so `cp .env.example .env` just works.
 */
export function refineSecrets(
  keys: readonly string[],
): (env: Record<string, unknown>, ctx: z.RefinementCtx) => void {
  return (env, ctx) => {
    if (!DEPLOYED_ENVS.includes(env.APP_ENV as AppEnv)) return;
    for (const key of keys) {
      const value = env[key];
      if (typeof value !== 'string') continue;
      if (value === PLACEHOLDER_SECRET || value.length < MIN_SECRET_LENGTH) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `must be a real secret of at least ${MIN_SECRET_LENGTH} characters in ${String(env.APP_ENV)} (generate with: openssl rand -base64 48)`,
        });
      }
    }
  };
}
