'use client';

import { createContext, type CSSProperties, type ReactNode, useContext } from 'react';

/** What a themed wrapper puts on its element; portalled content repeats it. */
export interface ThemeScope {
  preset: string;
  colorScheme: 'light' | 'dark';
  style: CSSProperties;
}

const ThemeScopeContext = createContext<ThemeScope | null>(null);

export function ThemeScopeProvider({
  scope,
  children,
}: {
  scope: ThemeScope;
  children: ReactNode;
}) {
  return <ThemeScopeContext.Provider value={scope}>{children}</ThemeScopeContext.Provider>;
}

/**
 * Sheets and other portalled content render under <body>, outside the ThemeProvider's element, so
 * they would fall back to the default preset. They spread these props to carry the theme along.
 */
export function useThemeScopeProps():
  | { 'data-preset': string; 'data-color-scheme': 'light' | 'dark'; style: CSSProperties }
  | undefined {
  const scope = useContext(ThemeScopeContext);
  if (!scope) return undefined;
  return {
    'data-preset': scope.preset,
    'data-color-scheme': scope.colorScheme,
    style: scope.style,
  };
}
