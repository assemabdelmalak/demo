import { DEFAULT_PRESET, PRESET_IDS, PRESETS, type PresetId, type ThemeColors } from './presets.js';
import { contrastRatio, isHexColor, readableOn } from '../lib/contrast.js';

/** `restaurants.theme` (DATA_MODEL §3); fields beyond these arrive with the theme editor (P2-T01). */
export interface RestaurantTheme {
  preset?: string;
  primaryColor?: string;
}

export interface ResolvedTheme extends ThemeColors {
  preset: PresetId;
  dark: boolean;
  /** False when an owner-picked primary fails AA against the surface; the editor warns (P2-T01). */
  primaryMeetsAa: boolean;
}

function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && (PRESET_IDS as readonly string[]).includes(value);
}

/** Preset colours, with the owner's primary override and a contrast-safe `onPrimary`. */
export function resolveTheme(theme: RestaurantTheme | null | undefined): ResolvedTheme {
  const preset = isPresetId(theme?.preset) ? theme.preset : DEFAULT_PRESET;
  const base = PRESETS[preset];
  const primary = isHexColor(theme?.primaryColor) ? theme.primaryColor.toLowerCase() : base.primary;
  return {
    ...base,
    preset,
    primary,
    onPrimary: readableOn(primary),
    primaryMeetsAa: contrastRatio(primary, base.surface) >= 3,
  };
}

/** CSS custom properties consumed by tokens.css and the Tailwind theme. */
export function themeCssVariables(theme: ResolvedTheme): Record<`--${string}`, string> {
  return {
    '--surface': theme.surface,
    '--ink': theme.ink,
    '--muted': theme.muted,
    '--primary': theme.primary,
    '--on-primary': theme.onPrimary,
    '--accent': theme.accent,
    '--line': theme.line,
  };
}
