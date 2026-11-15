import { describe, expect, it } from 'vitest';

import { slugBase, slugCandidates } from './slug';

describe('organisation slugs', () => {
  it('keeps Latin letters and digits from the name', () => {
    expect(slugBase('Beit Tayta')).toBe('beit-tayta');
    expect(slugBase('  Café  Liza & Co. 2 ')).toBe('cafe-liza-co-2');
    expect(slugBase('x'.repeat(60))).toHaveLength(40);
  });

  it('falls back to "org" for names without Latin characters', () => {
    expect(slugBase('بيت تيتا')).toBe('org');
    expect(slugBase('---')).toBe('org');
  });

  it('tries the plain base first, then distinct suffixed variants', () => {
    const candidates = slugCandidates('Beit Tayta');
    expect(candidates[0]).toBe('beit-tayta');
    expect(candidates).toHaveLength(5);
    for (const candidate of candidates.slice(1)) {
      expect(candidate).toMatch(/^beit-tayta-[a-z0-9]{6}$/);
    }
    expect(new Set(candidates).size).toBe(5);
  });
});
