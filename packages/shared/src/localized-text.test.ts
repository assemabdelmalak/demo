import { describe, expect, it } from 'vitest';

import { localizedTextSchema } from './localized-text.js';

describe('localizedTextSchema', () => {
  const schema = localizedTextSchema(10);

  it('accepts one or more languages and trims them', () => {
    expect(schema.parse({ en: ' Hummus ' })).toEqual({ en: 'Hummus' });
    expect(schema.parse({ ar: 'حمّص', en: 'Hummus', fr: 'Houmous' })).toEqual({
      ar: 'حمّص',
      en: 'Hummus',
      fr: 'Houmous',
    });
  });

  it('rejects an empty object, blank values and values that are too long', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ en: '   ' }).success).toBe(false);
    expect(schema.safeParse({ en: 'x'.repeat(11) }).success).toBe(false);
  });

  it('rejects languages outside the locale enum', () => {
    expect(schema.safeParse({ en: 'Hummus', de: 'Hummus' }).success).toBe(false);
  });
});
