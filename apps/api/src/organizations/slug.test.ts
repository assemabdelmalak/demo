import { describe, expect, it } from 'vitest';

import { slugBase, slugCandidates, slugSuffix } from './slug';

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

  it('never starts or ends with a hyphen, even where the 40-character cut lands on one', () => {
    // 39 letters, a separator, then more: the cut at 40 would end on the hyphen.
    const name = `${'a'.repeat(39)} bcd`;
    expect(slugBase(name)).toBe('a'.repeat(39));
    expect(slugBase('--- Beit --- Tayta ---')).toBe('beit-tayta');
    expect(slugBase('!!a!!b!!')).toBe('a-b');
  });

  it('stays fast on long runs of separators', () => {
    const hostile = `a${'-'.repeat(50_000)}!${' -'.repeat(50_000)}b`;
    const started = performance.now();
    expect(slugBase(hostile)).toBe('a-b');
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('draws six base-36 characters, every symbol reachable', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i += 1) {
      const suffix = slugSuffix();
      expect(suffix).toMatch(/^[a-z0-9]{6}$/);
      for (const char of suffix) seen.add(char);
    }
    // 12 000 draws over 36 symbols: missing one by chance is about 36 × (35/36)^12000 ≈ 0.
    expect(seen.size).toBe(36);
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
