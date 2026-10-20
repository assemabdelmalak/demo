import { type ReactNode } from 'react';

import { type RestaurantTheme, resolveTheme, themeCssVariables } from './restaurant-theme.js';

export interface ThemeProviderProps {
  theme?: RestaurantTheme | null;
  children: ReactNode;
  className?: string;
}

/**
 * Maps a restaurant theme to CSS variables on a wrapper element. A server component: the colours
 * are in the first paint, with no flash and no client JavaScript.
 */
export function ThemeProvider({ theme, children, className }: ThemeProviderProps) {
  const resolved = resolveTheme(theme);
  return (
    <div
      data-preset={resolved.preset}
      data-color-scheme={resolved.dark ? 'dark' : 'light'}
      className={className}
      style={themeCssVariables(resolved)}
    >
      {children}
    </div>
  );
}
