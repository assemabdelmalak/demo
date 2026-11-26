'use client';

import { useCallback, useEffect, useState } from 'react';

/** Better Auth allows 3 code emails a minute per address and path; one a minute stays well inside. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** A countdown in whole seconds for "Send a new code in 42 seconds". */
export function useCooldown(initialSeconds = 0): {
  remaining: number;
  start: (seconds?: number) => void;
} {
  const [until, setUntil] = useState(() =>
    initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : 0,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= now) return;
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [until, now]);

  const start = useCallback((seconds = RESEND_COOLDOWN_SECONDS) => {
    const current = Date.now();
    setNow(current);
    setUntil(current + seconds * 1000);
  }, []);

  return { remaining: Math.max(0, Math.ceil((until - now) / 1000)), start };
}
