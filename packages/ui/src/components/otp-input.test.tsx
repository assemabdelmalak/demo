// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Field } from './field.js';
import { OtpInput } from './otp-input.js';

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

function Harness({ onComplete }: { onComplete: (code: string) => void }) {
  const [code, setCode] = useState('');
  return (
    <Field id="code" label="Code">
      {(control) => (
        <OtpInput {...control} value={code} onChange={setCode} onComplete={onComplete} />
      )}
    </Field>
  );
}

const input = () => {
  const element = document.querySelector<HTMLInputElement>('input');
  if (!element) throw new Error('no input rendered');
  return element;
};

/** Types into a React-controlled input the way the browser does: native setter, then `input`. */
function type(element: HTMLInputElement, value: string) {
  act(() => {
    // React tracks the value through its own setter; the prototype's one bypasses it.
    Reflect.set(HTMLInputElement.prototype, 'value', value, element);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function paste(element: HTMLInputElement, text: string): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

describe('OtpInput', () => {
  it('is one labelled numeric field that reads left to right', () => {
    act(() => {
      root.render(<Harness onComplete={vi.fn()} />);
    });
    expect(document.querySelectorAll('input')).toHaveLength(1);
    const field = input();
    expect(field.id).toBe('code');
    expect(document.querySelector('label')?.htmlFor).toBe('code');
    expect(field.inputMode).toBe('numeric');
    expect(field.autocomplete).toBe('one-time-code');
    expect(field.dir).toBe('ltr');
  });

  it('drops anything that is not a digit and stops at six', () => {
    const onComplete = vi.fn();
    act(() => {
      root.render(<Harness onComplete={onComplete} />);
    });
    type(input(), '12a');
    expect(input().value).toBe('12');
    expect(onComplete).not.toHaveBeenCalled();
    type(input(), '12345678');
    expect(input().value).toBe('123456');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456');
  });

  it('takes a pasted code with separators, also in Arabic digits', () => {
    const onComplete = vi.fn();
    act(() => {
      root.render(<Harness onComplete={onComplete} />);
    });
    const event = paste(input(), '٤٢٤ ٢٤٢');
    expect(event.defaultPrevented).toBe(true);
    expect(input().value).toBe('424242');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('424242');
  });
});
