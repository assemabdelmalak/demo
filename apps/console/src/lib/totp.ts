/** The base32 secret from an `otpauth://` URI, in groups of four for typing by hand. */
export function totpSecret(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'otpauth:') return null;
    const secret = url.searchParams.get('secret');
    return secret ? (secret.match(/.{1,4}/g) ?? []).join(' ') : null;
  } catch {
    return null;
  }
}
