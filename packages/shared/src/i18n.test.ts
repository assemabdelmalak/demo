import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, dirFor, isLocale, resolveUiLocale, withFallbackMessages } from './i18n.js';

describe('resolveUiLocale (ADR-009: always English first)', () => {
  it('defaults to English with no input', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(resolveUiLocale()).toBe('en');
  });

  it("honours the visitor's language switch first", () => {
    expect(resolveUiLocale({ cookie: 'ar' })).toBe('ar');
    expect(resolveUiLocale({ cookie: 'ar', restaurantDefault: 'en' })).toBe('ar');
  });

  it("falls back to the restaurant's default, then English", () => {
    expect(resolveUiLocale({ restaurantDefault: 'ar' })).toBe('ar');
    expect(resolveUiLocale({ cookie: 'de', restaurantDefault: 'ar' })).toBe('ar');
    expect(resolveUiLocale({ cookie: 'de' })).toBe('en');
  });

  it('ignores locales without a UI yet (French) and locales the restaurant disabled', () => {
    expect(resolveUiLocale({ cookie: 'fr' })).toBe('en');
    expect(resolveUiLocale({ cookie: 'ar', enabled: ['en'] })).toBe('en');
    expect(resolveUiLocale({ restaurantDefault: 'ar', enabled: ['en'] })).toBe('en');
  });
});

describe('dirFor', () => {
  it('is rtl only for Arabic', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
    expect(dirFor('fr')).toBe('ltr');
  });
});

describe('isLocale', () => {
  it('accepts content locales only', () => {
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('de')).toBe(false);
  });
});

describe('withFallbackMessages', () => {
  it('fills missing keys from the English reference at every depth', () => {
    const en = {
      home: { title: 'Radd Menu', tagline: 'Scan to see the menu & order' },
      nav: { back: 'Back' },
    };
    const ar = { home: { tagline: 'امسح الرمز لتصفّح القائمة والطلب' } };
    expect(withFallbackMessages(en, ar)).toEqual({
      home: { title: 'Radd Menu', tagline: 'امسح الرمز لتصفّح القائمة والطلب' },
      nav: { back: 'Back' },
    });
  });
});
