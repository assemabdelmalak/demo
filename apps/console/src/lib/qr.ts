/** One SVG path for all dark modules of a QR matrix: small markup, crisp at any size. */
export function qrPath(data: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${String(x)} ${String(y)}h1v1h-1z`);
    });
  });
  return parts.join('');
}
