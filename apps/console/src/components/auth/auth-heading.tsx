import { type ReactNode } from 'react';

/** The page heading every account page starts with. */
export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-title font-semibold">{title}</h1>
      {subtitle ? <p className="text-muted">{subtitle}</p> : null}
    </div>
  );
}
