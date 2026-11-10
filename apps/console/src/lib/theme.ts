/** Shared by the server layout and the client toggle; must not live in a 'use client' module. */
export const THEME_COOKIE = 'radd_console_theme';
export type ConsoleTheme = 'light' | 'dark';

export function parseConsoleTheme(value: string | undefined): ConsoleTheme {
  return value === 'dark' ? 'dark' : 'light';
}
