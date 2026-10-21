/** Deeper bodies are rejected before fingerprinting; no legitimate payload nests this far. */
export const MAX_JSON_DEPTH = 64;

export class JsonTooDeepError extends Error {
  constructor() {
    super(`JSON nested deeper than ${String(MAX_JSON_DEPTH)} levels`);
    this.name = 'JsonTooDeepError';
  }
}

/** JSON with object keys sorted at every level, so `{a,b}` and `{b,a}` fingerprint the same. */
export function canonicalJson(value: unknown): string {
  // JSON.stringify(undefined) yields undefined, not a string; a missing body fingerprints as null.
  return value === undefined ? 'null' : JSON.stringify(sortKeys(value, 0));
}

function sortKeys(value: unknown, depth: number): unknown {
  // V8 parses far deeper JSON than this recursion can walk; a bounded depth turns a stack
  // overflow (500) into a clean 400.
  if (depth > MAX_JSON_DEPTH) throw new JsonTooDeepError();
  if (Array.isArray(value)) return value.map((item) => sortKeys(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key], depth + 1)]),
    );
  }
  return value;
}
