import { randomBytes } from 'node:crypto';

const MAX_BASE_LENGTH = 40;

/**
 * The readable part of an organisation slug: Latin letters and digits from the name, joined by
 * hyphens. Names in Arabic script (or anything else) fall back to `org`; the slug is an internal
 * handle, not something diners read.
 */
export function slugBase(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/g, '');
  return base === '' ? 'org' : base;
}

/** Six random base-36 characters: about 2 billion values, plenty for names that collide. */
export function slugSuffix(): string {
  return [...randomBytes(6)].map((byte) => (byte % 36).toString(36)).join('');
}

/**
 * Candidates in the order to try: the plain base first, then the base with random suffixes. The
 * caller stops at the first one that is free.
 */
export function slugCandidates(name: string, attempts = 5): string[] {
  const base = slugBase(name);
  return [base, ...Array.from({ length: attempts - 1 }, () => `${base}-${slugSuffix()}`)];
}
