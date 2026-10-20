import { describe, expect, it } from 'vitest';

import { PARTICIPANT_PALETTE, PRESET_IDS, PRESETS } from './presets.js';
import { resolveTheme, themeCssVariables } from './restaurant-theme.js';
import { AA_TEXT, contrastRatio, readableOn, relativeLuminance } from '../lib/contrast.js';

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('picks the more readable of black and white', () => {
    expect(readableOn('#ffffff')).toBe('#000000');
    expect(readableOn('#1b1d24')).toBe('#ffffff');
    expect(readableOn('#ffc914')).toBe('#000000');
  });

  it('rejects anything that is not #rrggbb', () => {
    expect(() => relativeLuminance('red')).toThrow();
  });
});

describe.each(PRESET_IDS)('preset %s', (id) => {
  const preset = PRESETS[id];

  it('keeps body and muted text at WCAG AA on its surface', () => {
    expect(contrastRatio(preset.ink, preset.surface)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(preset.muted, preset.surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('keeps button text at WCAG AA on the primary colour', () => {
    expect(contrastRatio(preset.onPrimary, preset.primary)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('resolveTheme', () => {
  it('defaults to Zaatar', () => {
    expect(resolveTheme(undefined).preset).toBe('zaatar');
    expect(resolveTheme({ preset: 'unknown' }).preset).toBe('zaatar');
  });

  it("applies the owner's primary and derives a readable onPrimary", () => {
    const light = resolveTheme({ preset: 'corniche', primaryColor: '#FFC914' });
    expect(light.primary).toBe('#ffc914');
    expect(light.onPrimary).toBe('#000000');
    expect(light.primaryMeetsAa).toBe(false);
    expect(resolveTheme({ preset: 'plain', primaryColor: '#123456' }).onPrimary).toBe('#ffffff');
  });

  it('ignores malformed colours', () => {
    expect(resolveTheme({ primaryColor: 'url(javascript:alert(1))' }).primary).toBe(
      PRESETS.zaatar.primary,
    );
  });

  it('exposes the colours as CSS variables', () => {
    expect(themeCssVariables(resolveTheme({ preset: 'rooftop' }))).toMatchObject({
      '--surface': '#1b1d24',
      '--primary': '#e5484d',
    });
  });
});

describe('participant palette', () => {
  it('has twelve distinct colours', () => {
    expect(new Set(PARTICIPANT_PALETTE).size).toBe(12);
  });
});
