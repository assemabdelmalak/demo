import { describe, expect, it } from 'vitest';

import { PUBLIC_ENV_ELEMENT_ID, readPublicEnv, serializePublicEnv } from './index.js';

describe('serializePublicEnv', () => {
  it('cannot be used to break out of the script element', () => {
    const json = serializePublicEnv({ url: '</script><script>alert(1)</script>' });
    expect(json).not.toContain('</script>');
    expect(JSON.parse(json)).toEqual({ url: '</script><script>alert(1)</script>' });
  });
});

describe('readPublicEnv', () => {
  it('parses the rendered element', () => {
    const doc = {
      getElementById: (id: string) =>
        id === PUBLIC_ENV_ELEMENT_ID
          ? { textContent: serializePublicEnv({ NEXT_PUBLIC_API_URL: 'http://api' }) }
          : null,
    } as unknown as Document;
    expect(readPublicEnv(doc)).toEqual({ NEXT_PUBLIC_API_URL: 'http://api' });
  });

  it('fails loudly when the element is missing', () => {
    const doc = { getElementById: () => null } as unknown as Document;
    expect(() => readPublicEnv(doc)).toThrow(/radd-public-env/);
  });
});
