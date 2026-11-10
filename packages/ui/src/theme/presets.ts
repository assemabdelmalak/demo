import { readableOn } from '../lib/contrast.js';

/** Restaurant theme presets (UX §3). `onPrimary` is derived, never hand-picked. */
export const PRESET_IDS = ['zaatar', 'corniche', 'sumac', 'rooftop', 'plain'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export interface ThemeColors {
  surface: string;
  ink: string;
  muted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  line: string;
}

type BaseColors = Omit<ThemeColors, 'onPrimary'>;

const BASE: Record<PresetId, BaseColors & { dark: boolean }> = {
  zaatar: {
    surface: '#ffffff',
    ink: '#1f2a1c',
    muted: '#5b6656',
    primary: '#4e6b2f',
    accent: '#b8892b',
    line: '#e3e8dd',
    dark: false,
  },
  corniche: {
    surface: '#f7fafb',
    ink: '#0e2a3b',
    muted: '#4d6472',
    primary: '#0f6e8c',
    accent: '#f2b134',
    line: '#dce6eb',
    dark: false,
  },
  sumac: {
    surface: '#ffffff',
    ink: '#241418',
    muted: '#6e5a5e',
    primary: '#8e1b3a',
    accent: '#d9a441',
    line: '#eee1e4',
    dark: false,
  },
  rooftop: {
    surface: '#1b1d24',
    ink: '#f3f1ec',
    muted: '#a9abb3',
    primary: '#e5484d',
    accent: '#7dd3c0',
    line: '#2c2f38',
    dark: true,
  },
  plain: {
    surface: '#ffffff',
    ink: '#1a1a1a',
    muted: '#616161',
    primary: '#2b2b2b',
    accent: '#2b2b2b',
    line: '#e6e6e6',
    dark: false,
  },
};

export const PRESETS: Record<PresetId, ThemeColors & { dark: boolean }> = Object.fromEntries(
  Object.entries(BASE).map(([id, colors]) => [
    id,
    { ...colors, onPrimary: readableOn(colors.primary) },
  ]),
) as Record<PresetId, ThemeColors & { dark: boolean }>;

export const DEFAULT_PRESET: PresetId = 'zaatar';

/** System colours are not themeable: they carry meaning (UX §3). */
export const SYSTEM_COLORS = {
  success: '#1e7a46',
  warning: '#a15c00',
  danger: '#b42318',
  info: '#1d5fa8',
  allergenContains: '#b42318',
  allergenMayContain: '#a15c00',
  allergenFree: '#1e7a46',
  allergenUnknown: '#5f6b7a',
} as const;

/** Participant colours for group tabs (UX §3), assigned in join order. */
export const PARTICIPANT_PALETTE = [
  '#e4572e',
  '#17bebb',
  '#ffc914',
  '#76b041',
  '#2e86ab',
  '#a23b72',
  '#f18f01',
  '#6a4c93',
  '#1b998b',
  '#c5283d',
  '#3d5a80',
  '#8ac926',
] as const;
