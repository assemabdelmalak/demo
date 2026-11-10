import { type ReactNode } from 'react';

import { type RestaurantTheme, resolveTheme, themeCssVariables } from './restaurant-theme.js';
import { ThemeScopeProvider } from './theme-scope.js';

export interface ThemeProviderProps {
  theme?: RestaurantTheme | null;
  children: ReactNode;
  className?: string;
}

/**
 * Maps a restaurant theme to CSS variables on a wrapper element. A server component: the colours
 * are in the first paint, with no flash. The same values go into a context, because portalled
 * content (sheets) renders outside this element.
 */
export function ThemeProvider({ theme, children, className }: ThemeProviderProps) {
  const resolved = resolveTheme(theme);
  const colorScheme = resolved.dark ? 'dark' : 'light';
  const style = themeCssVariables(resolved);
  return (
    <div
      data-preset={resolved.preset}
      data-color-scheme={colorScheme}
      className={className}
      style={style}
    >
      <ThemeScopeProvider scope={{ preset: resolved.preset, colorScheme, style }}>
        {children}
      </ThemeScopeProvider>
    </div>
  );
}
