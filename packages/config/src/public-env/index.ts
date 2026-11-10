/**
 * Runtime delivery of browser-safe config (ADR-012). The Next server renders the parsed public
 * env into a JSON <script> element; browser code reads it back, so nothing is inlined at build time
 * and one image serves every environment.
 */
export const PUBLIC_ENV_ELEMENT_ID = 'radd-public-env';

/**
 * JSON safe to place inside <script type="application/json">: `<` is escaped so a value can
 * never close the element, and U+2028/2029 are escaped for older parsers.
 */
export function serializePublicEnv(env: Record<string, unknown>): string {
  return JSON.stringify(env)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Reads the config the server rendered; throws when called outside a browser page that has it.
 * Values are only as trustworthy as the page, so callers check the fields they use.
 */
export function readPublicEnv(doc: Document = document): Record<string, unknown> {
  const element = doc.getElementById(PUBLIC_ENV_ELEMENT_ID);
  if (!element?.textContent) throw new Error(`#${PUBLIC_ENV_ELEMENT_ID} is missing from the page`);
  return JSON.parse(element.textContent) as Record<string, unknown>;
}
