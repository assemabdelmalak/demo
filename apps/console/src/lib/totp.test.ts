import { describe, expect, it } from 'vitest';

import { qrPath } from './qr';
import { totpSecret } from './totp';

describe('totpSecret', () => {
  it('reads the secret from an otpauth URI in groups of four', () => {
    expect(
      totpSecret('otpauth://totp/Radd%20Menu:rana?secret=JBSWY3DPEHPK3PXP&issuer=Radd%20Menu'),
    ).toBe('JBSW Y3DP EHPK 3PXP');
  });

  it('returns null for anything else', () => {
    expect(totpSecret('https://example.com/?secret=ABC')).toBeNull();
    expect(totpSecret('otpauth://totp/x')).toBeNull();
    expect(totpSecret('not a url')).toBeNull();
  });
});

describe('qrPath', () => {
  it('draws one square per dark module', () => {
    expect(
      qrPath([
        [true, false],
        [false, true],
      ]),
    ).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
  });
});
