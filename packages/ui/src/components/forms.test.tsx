import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Alert } from './alert.js';
import { Field } from './field.js';
import { Input } from './input.js';
import { Label } from './label.js';
import { normalizeCode } from './otp-input.js';

/** Attributes of the first element matching `tag`, from static markup. */
function attributesOf(html: string, tag: string): Record<string, string> {
  const match = new RegExp(`<${tag}\\b([^>]*)>`).exec(html);
  const attributes: Record<string, string> = {};
  for (const [, name = '', value = ''] of (match?.[1] ?? '').matchAll(/([\w-]+)="([^"]*)"/g)) {
    attributes[name] = value;
  }
  return attributes;
}

describe('Input', () => {
  it('is a text input with a 44 px target and the input radius', () => {
    const input = attributesOf(renderToStaticMarkup(<Input name="email" />), 'input');
    expect(input.type).toBe('text');
    expect(input.class).toContain('min-h-11');
    expect(input.class).toContain('rounded-input');
  });

  it('keeps the caller type', () => {
    expect(attributesOf(renderToStaticMarkup(<Input type="email" />), 'input').type).toBe('email');
  });
});

describe('Label', () => {
  it('points at its control', () => {
    expect(renderToStaticMarkup(<Label htmlFor="email">Email</Label>)).toMatch(
      /^<label [^>]*for="email"/,
    );
  });
});

describe('Field', () => {
  it('labels the control and describes it with the hint', () => {
    const html = renderToStaticMarkup(
      <Field id="password" label="Password" hint="At least 12 characters" required>
        {(control) => <Input type="password" {...control} />}
      </Field>,
    );
    expect(attributesOf(html, 'label').for).toBe('password');
    const input = attributesOf(html, 'input');
    expect(input.id).toBe('password');
    expect(input['aria-describedby']).toBe('password-hint');
    expect(input['aria-required']).toBe('true');
    expect(input['aria-invalid']).toBeUndefined();
    expect(html).toContain('id="password-hint"');
  });

  it('marks the control invalid and adds the error to its description', () => {
    const html = renderToStaticMarkup(
      <Field id="email" label="Email" hint="Work or personal" error="Enter your email address">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = attributesOf(html, 'input');
    expect(input['aria-invalid']).toBe('true');
    expect(input['aria-describedby']).toBe('email-hint email-error');
    expect(html).toContain('<p id="email-error"');
    expect(html).toContain('Enter your email address');
  });

  it('generates an ID when none is given and leaves out empty descriptions', () => {
    const html = renderToStaticMarkup(
      <Field label="Name" error="">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = attributesOf(html, 'input');
    expect(input.id).toBeTruthy();
    expect(attributesOf(html, 'label').for).toBe(input.id);
    expect(input['aria-describedby']).toBeUndefined();
    expect(input['aria-invalid']).toBeUndefined();
  });
});

describe('Alert', () => {
  it('announces errors at once and other messages politely', () => {
    expect(renderToStaticMarkup(<Alert tone="danger">Wrong code</Alert>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Alert tone="success">Saved</Alert>)).toContain('role="status"');
    expect(renderToStaticMarkup(<Alert>Heads up</Alert>)).toContain('role="status"');
  });

  it('keeps the icon out of the accessible text', () => {
    const html = renderToStaticMarkup(<Alert tone="danger" title="Sign-in failed" />);
    expect(html).toContain('<svg aria-hidden="true"');
    expect(html).toContain('Sign-in failed');
  });
});

describe('normalizeCode', () => {
  it('keeps digits only and caps the length', () => {
    expect(normalizeCode('123 456', 6)).toBe('123456');
    expect(normalizeCode('12-34-56-78', 6)).toBe('123456');
    expect(normalizeCode('abc', 6)).toBe('');
  });

  it('turns Arabic-Indic and Extended Arabic-Indic digits into Latin digits', () => {
    expect(normalizeCode('٤٢٤٢٤٢', 6)).toBe('424242');
    expect(normalizeCode('۱۲۳۴۵۶', 6)).toBe('123456');
    expect(normalizeCode('1٢3۴5٦', 6)).toBe('123456');
  });
});
