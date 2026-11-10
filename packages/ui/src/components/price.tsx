import { type ComponentProps } from 'react';

import { cn } from '../lib/cn.js';

export interface PriceProps extends ComponentProps<'span'> {
  /** Already formatted base-currency amount, e.g. "$6.50". Money maths lives in shared/money (P3-T03). */
  primary: string;
  /** Already formatted secondary currency, e.g. "580,000 LBP"; omitted when the restaurant hides it. */
  secondary?: string | undefined;
}

/**
 * Base currency on top, secondary below (UX §5). Each amount is isolated with <bdi> so Western
 * digits and currency symbols keep their order inside Arabic (RTL) text.
 */
export function Price({ primary, secondary, className, ...props }: PriceProps) {
  return (
    <span
      data-slot="price"
      className={cn('inline-flex flex-col items-end tabular-nums', className)}
      {...props}
    >
      <bdi className="font-semibold text-ink">{primary}</bdi>
      {secondary ? <bdi className="text-caption text-muted">{secondary}</bdi> : null}
    </span>
  );
}
