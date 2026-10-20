/** JSON with object keys sorted at every level, so `{a,b}` and `{b,a}` fingerprint the same. */
export function canonicalJson(value: unknown): string {
  // JSON.stringify(undefined) yields undefined, not a string; a missing body fingerprints as null.
  return value === undefined ? 'null' : JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
