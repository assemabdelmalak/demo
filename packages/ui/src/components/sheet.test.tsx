// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet.js';
import { PRESETS } from '../theme/presets.js';
import { ThemeProvider } from '../theme/theme-provider.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function openSheet() {
  return (
    <Sheet defaultOpen>
      <SheetContent>
        <SheetTitle>Fattoush</SheetTitle>
        <SheetDescription>Crisp vegetables, sumac and toasted bread</SheetDescription>
      </SheetContent>
    </Sheet>
  );
}

const content = () => document.querySelector<HTMLElement>('[data-slot="sheet-content"]');

describe('SheetContent', () => {
  it('carries the restaurant theme into the portal, outside the themed wrapper', () => {
    act(() => {
      root.render(<ThemeProvider theme={{ preset: 'rooftop' }}>{openSheet()}</ThemeProvider>);
    });

    const sheet = content();
    expect(sheet).not.toBeNull();
    // The portal is a child of <body>, not of the ThemeProvider's element.
    expect(host.contains(sheet)).toBe(false);
    expect(sheet?.style.getPropertyValue('--surface')).toBe(PRESETS.rooftop.surface);
    expect(sheet?.style.getPropertyValue('--ink')).toBe(PRESETS.rooftop.ink);
    expect(sheet?.dataset.preset).toBe('rooftop');
    expect(sheet?.dataset.colorScheme).toBe('dark');
  });

  it('keeps a caller style on top of the theme', () => {
    act(() => {
      root.render(
        <ThemeProvider theme={{ preset: 'sumac' }}>
          <Sheet defaultOpen>
            <SheetContent style={{ maxHeight: '50dvh' }}>
              <SheetTitle>Fattoush</SheetTitle>
              <SheetDescription>Crisp vegetables</SheetDescription>
            </SheetContent>
          </Sheet>
        </ThemeProvider>,
      );
    });

    const sheet = content();
    expect(sheet?.style.maxHeight).toBe('50dvh');
    expect(sheet?.style.getPropertyValue('--surface')).toBe(PRESETS.sumac.surface);
  });

  it('adds no theme attributes outside a ThemeProvider (the console)', () => {
    act(() => {
      root.render(openSheet());
    });

    const sheet = content();
    expect(sheet).not.toBeNull();
    expect(sheet?.style.getPropertyValue('--surface')).toBe('');
    expect(sheet?.dataset.preset).toBeUndefined();
  });
});
