import { PUBLIC_ENV_ELEMENT_ID, serializePublicEnv } from '@radd/config/public-env';

/** Renders the browser-safe config into the page at request time (ADR-012). */
export function PublicEnvScript({ env }: { env: Record<string, unknown> }) {
  return (
    <script
      id={PUBLIC_ENV_ELEMENT_ID}
      type="application/json"
      // JSON, not script: browsers never execute type="application/json", and `<` is escaped.
      dangerouslySetInnerHTML={{ __html: serializePublicEnv(env) }}
    />
  );
}
