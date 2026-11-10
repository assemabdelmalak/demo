import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Avatar, initials } from './avatar.js';
import { Button, buttonVariants } from './button.js';
import { Chip } from './chip.js';
import { Price } from './price.js';
import { Skeleton } from './skeleton.js';
import { cn } from '../lib/cn.js';
import { AA_TEXT, contrastRatio, readableOn } from '../lib/contrast.js';
import { PARTICIPANT_PALETTE } from '../theme/presets.js';

describe('Price', () => {
  it('isolates both amounts with <bdi> so digits stay in order inside RTL text', () => {
    const html = renderToStaticMarkup(<Price primary="$6.50" secondary="580,000 ل.ل." />);
    expect(html).toContain('<bdi class="font-semibold text-ink">$6.50</bdi>');
    expect(html).toContain('580,000 ل.ل.</bdi>');
  });

  it('omits the secondary amount when not given', () => {
    expect(renderToStaticMarkup(<Price primary="$6.50" />).match(/<bdi/g)).toHaveLength(1);
  });
});

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    expect(renderToStaticMarkup(<Button>Order</Button>)).toContain('type="button"');
    expect(renderToStaticMarkup(<Button type="submit">Send</Button>)).toContain('type="submit"');
  });

  it('keeps a 44 px minimum tap target', () => {
    expect(renderToStaticMarkup(<Button>Order</Button>)).toContain('min-h-11');
  });

  it('renders its child element when asChild is set', () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="/menu">Menu</a>
      </Button>,
    );
    expect(html).toMatch(/^<a [^>]*href="\/menu"/);
    expect(html).not.toContain('type=');
  });
});

describe('Chip', () => {
  it('exposes its toggle state through aria-pressed', () => {
    expect(renderToStaticMarkup(<Chip selected>Vegan</Chip>)).toContain('aria-pressed="true"');
    expect(renderToStaticMarkup(<Chip>Vegan</Chip>)).toContain('aria-pressed="false"');
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    expect(renderToStaticMarkup(<Skeleton />)).toContain('aria-hidden="true"');
  });
});

describe('initials', () => {
  it('handles Latin and Arabic names', () => {
    expect(initials('Rami Haddad')).toBe('RH');
    expect(initials('nour')).toBe('N');
    expect(initials('  سارة   خوري ')).toBe('سخ');
  });
});

describe('cn with the design tokens', () => {
  it('keeps both a custom text size and a text colour', () => {
    const small = cn(buttonVariants({ size: 'sm' }));
    expect(small).toContain('text-small');
    expect(small).toContain('text-on-primary');
    expect(cn(buttonVariants({ variant: 'danger', size: 'sm' }))).toContain('text-white');
    expect(cn(buttonVariants())).toContain('text-body');
  });

  it('still lets a later size or radius win', () => {
    expect(cn('text-small', 'text-body')).toBe('text-body');
    expect(cn('rounded-button', 'rounded-chip')).toBe('rounded-chip');
  });
});

describe('Avatar', () => {
  it('names the avatar once and hides the initials from assistive technology', () => {
    const html = renderToStaticMarkup(<Avatar name="Rania Haddad" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Rania Haddad"');
  });

  it('gives initials AA contrast on every participant colour', () => {
    for (const color of PARTICIPANT_PALETTE) {
      expect(contrastRatio(color, readableOn(color)), color).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});
