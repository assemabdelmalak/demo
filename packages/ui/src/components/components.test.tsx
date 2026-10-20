import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { initials } from './avatar.js';
import { Button } from './button.js';
import { Chip } from './chip.js';
import { Price } from './price.js';
import { Skeleton } from './skeleton.js';

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
