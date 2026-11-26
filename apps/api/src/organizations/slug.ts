import { randomInt } from 'node:crypto';

const MAX_BASE_LENGTH = 40;
const SUFFIX_LENGTH = 6;

/** Combining marks left behind by NFKD, so "Café" keeps its "e". */
const COMBINING_MARKS = /[̀-ͯ]/g;
/** Runs of anything that is not a Latin letter or digit. One character class: linear time. */
const SEPARATORS = /[^a-z0-9]+/;

/**
 * The readable part of an organisation slug: Latin letters and digits from the name, joined by
 * hyphens. Names in Arabic script (or anything else) fall back to `org`; the slug is an internal
 * handle, not something diners read.
 *
 * Splitting into words and joining them leaves no hyphen at either end, so no trimming regex is
 * needed (a pattern like `-+$` backtracks quadratically on long runs, CodeQL js/polynomial-redos).
 */
export function slugBase(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .split(SEPARATORS)
    .filter((word) => word !== '');
  let base = words.join('-').slice(0, MAX_BASE_LENGTH);
  // Hyphens never repeat, so a cut can leave at most one at the end.
  if (base.endsWith('-')) base = base.slice(0, -1);
  return base === '' ? 'org' : base;
}

/**
 * Six random base-36 characters: about 2 billion values, plenty for names that collide.
 * `randomInt` draws each one uniformly; `byte % 36` would favour the first four symbols
 * (CodeQL js/biased-cryptographic-random).
 */
export function slugSuffix(): string {
  return Array.from({ length: SUFFIX_LENGTH }, () => randomInt(36).toString(36)).join('');
}

/**
 * Candidates in the order to try: the plain base first, then the base with random suffixes. The
 * caller stops at the first one that is free.
 */
export function slugCandidates(name: string, attempts = 5): string[] {
  const base = slugBase(name);
  return [base, ...Array.from({ length: attempts - 1 }, () => `${base}-${slugSuffix()}`)];
}
