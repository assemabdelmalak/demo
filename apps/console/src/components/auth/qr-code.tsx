import { encode } from 'uqr';

import { qrPath } from '@/lib/qr';

/**
 * A QR code drawn in the browser from `value`, so the two-factor secret never goes to a
 * third-party image service. Always black on white with its quiet zone, in dark mode too:
 * authenticator apps do not all read inverted codes. Never mirrored in RTL (UX §5).
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 4 });
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      shapeRendering="crispEdges"
      className="size-48 bg-white text-black"
    >
      <path d={qrPath(data)} fill="currentColor" />
    </svg>
  );
}
