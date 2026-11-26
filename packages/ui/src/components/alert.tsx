import { type ComponentProps, type ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export type AlertTone = 'danger' | 'info' | 'success';

const TONES: Record<AlertTone, string> = {
  danger: 'border-danger-text bg-danger-text/10',
  info: 'border-line bg-line/40',
  success: 'border-success bg-success/10',
};

function Icon({ tone }: { tone: AlertTone }) {
  // Meaning is carried by the text; the icon only repeats it, so it is hidden from readers.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={cn(
        'mt-0.5 size-5 shrink-0',
        tone === 'danger' ? 'text-danger-text' : tone === 'success' ? 'text-success' : 'text-muted',
      )}
      fill="currentColor"
    >
      {tone === 'success' ? (
        <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm4.03 6.28-4.75 5a.75.75 0 0 1-1.07.02l-2.25-2.2a.75.75 0 1 1 1.05-1.07l1.7 1.66 4.23-4.45a.75.75 0 1 1 1.09 1.04Z" />
      ) : (
        <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 4a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5.5Zm0 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
      )}
    </svg>
  );
}

export interface AlertProps extends Omit<ComponentProps<'div'>, 'title'> {
  tone?: AlertTone;
  title?: ReactNode;
}

/**
 * A message about the whole form or page. Errors use `role="alert"`, so they are announced the
 * moment they appear; info and success use the politer `role="status"`. Text stays in `ink`:
 * the tone is a border, a tint and an icon, never the only signal (UX §9).
 */
export function Alert({ tone = 'info', title, className, children, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex gap-2 rounded-input border px-3 py-2.5 text-small text-ink',
        TONES[tone],
        className,
      )}
      {...props}
    >
      <Icon tone={tone} />
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
